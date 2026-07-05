const crypto = require('crypto');
const { Op } = require('sequelize');
const { TrustedDevice, AttendanceQrChallenge, AttendanceRiskEvent, AttendanceAttempt, Session } = require('../models');
const env = require('../utils/env');
const logger = require('../utils/logger');

const generateNonce = () => crypto.randomBytes(24).toString('hex');

const signPayload = (payload) => {
  const data = Object.keys(payload).sort().map((k) => `${k}=${payload[k]}`).join('&');
  return crypto.createHmac('sha256', env.attendanceQrSigningSecret).update(data).digest('hex');
};

const verifySignature = (payload, signature) => {
  const expected = signPayload(payload);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

const buildQrChallenge = async (sessionId, sessionKey) => {
  const nonce = generateNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + env.attendanceQrRotationSeconds * 1000);

  const payload = {
    type: 'attendance-session',
    sessionId: String(sessionId),
    sessionKey,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const signature = signPayload(payload);

  await AttendanceQrChallenge.create({
    sessionId,
    nonce,
    issuedAt,
    expiresAt,
    signatureHash: crypto.createHash('sha256').update(signature).digest('hex'),
  });

  return { ...payload, signature };
};

const validateQrChallenge = async (challenge) => {
  try {
    const { sessionId, sessionKey, nonce, issuedAt, expiresAt, signature } = challenge;

    if (!sessionId || !sessionKey || !nonce || !issuedAt || !expiresAt || !signature) {
      return { valid: false, reason: 'Invalid QR challenge format.' };
    }

    if (challenge.type !== 'attendance-session') {
      return { valid: false, reason: 'Invalid QR challenge type.' };
    }

    const now = new Date();
    const exp = new Date(expiresAt);
    if (now > exp) {
      return { valid: false, reason: 'This QR code has expired. Scan the current QR code.' };
    }

    const payload = { type: challenge.type, sessionId, sessionKey, nonce, issuedAt, expiresAt };
    if (!verifySignature(payload, signature)) {
      return { valid: false, reason: 'Invalid QR code signature.' };
    }

    const stored = await AttendanceQrChallenge.findOne({ where: { nonce } });
    if (!stored) {
      return { valid: false, reason: 'QR challenge not found.' };
    }

    if (stored.usedAt) {
      return { valid: false, reason: 'This QR code has already been used.' };
    }

    return { valid: true, challenge: stored };
  } catch (error) {
    logger.error('QR challenge validation error', { message: error.message });
    return { valid: false, reason: 'QR validation failed.' };
  }
};

const markQrChallengeUsed = async (nonce, userId) => {
  await AttendanceQrChallenge.update(
    { usedAt: new Date(), usedByUserId: userId },
    { where: { nonce, usedAt: null } }
  );
};

const computeRiskScore = async ({ studentId, sessionId, trustedDeviceId, ipAddress, latitude, longitude, accuracy, locationTimestamp }) => {
  const flags = [];
  let score = 0;

  try {
    const student = await require('../models').User.findByPk(studentId, {
      attributes: ['id', 'lastKnownIp', 'lastKnownDeviceHash'],
    });

    if (student && student.lastKnownIp && ipAddress && student.lastKnownIp !== ipAddress) {
      score += 5;
      flags.push('ip_address_changed');
    }

    if (!trustedDeviceId) {
      score += 20;
      flags.push('untrusted_device');
    }

    const deviceUsageCount = await AttendanceAttempt.count({
      where: {
        sessionId,
        trustedDeviceId: trustedDeviceId || null,
        studentId: { [Op.ne]: studentId },
        status: { [Op.in]: ['present', 'late'] },
      },
    });

    if (deviceUsageCount > 0) {
      score += 40;
      flags.push('device_used_for_other_account');
    }

    const recentAttempts = await AttendanceAttempt.findAll({
      where: { studentId, sessionId },
      order: [['createdAt', 'DESC']],
      limit: 3,
    });

    if (recentAttempts.length > 0) {
      const lastAttempt = recentAttempts[0];
      const lastCoords = lastAttempt.metadata?.lastLocation;

      if (lastCoords && latitude && longitude) {
        const dist = Math.round(
          distanceMeters(
            Number(lastCoords.lat),
            Number(lastCoords.lng),
            Number(latitude),
            Number(longitude)
          )
        );
        const timeDiff = (new Date() - new Date(lastAttempt.createdAt)) / 1000;

        if (dist > 10000 && timeDiff < 300) {
          score += 25;
          flags.push('impossible_location_jump');
        }
      }
    }

    const sameCoordsCount = await AttendanceAttempt.count({
      where: {
        sessionId,
        latitude: String(latitude),
        longitude: String(longitude),
        id: { [Op.ne]: 0 },
      },
    });

    if (sameCoordsCount > 3) {
      score += 15;
      flags.push('identical_coordinates');
    }

    const session = await Session.findByPk(sessionId);
    if (session) {
      const sessionStart = new Date(`${session.date}T${session.startTime}`);
      const now = new Date();
      const minutesSinceStart = (now - sessionStart) / 60000;

      if (minutesSinceStart < 1) {
        score += 5;
        flags.push('marked_immediately_after_session_start');
      }
    }

    if (accuracy !== null && accuracy !== undefined && accuracy < 5) {
      score += 10;
      flags.push('suspiciously_perfect_accuracy');
    }

    if (locationTimestamp) {
      const locationAge = (Date.now() - new Date(locationTimestamp).getTime()) / 1000;
      if (locationAge > env.attendanceMaxLocationAgeSeconds) {
        score += 10;
        flags.push('stale_location');
      }
    }

    const ipUsageCount = await AttendanceAttempt.count({
      where: {
        sessionId,
        ipAddress,
        studentId: { [Op.ne]: studentId },
      },
    });

    if (ipUsageCount > 5) {
      score += 10;
      flags.push('ip_shared_by_many_accounts');
    }

  } catch (error) {
    logger.warn('Risk scoring error', { message: error.message });
  }

  const clampedScore = Math.min(100, Math.max(0, score));

  let action = 'allow';
  if (clampedScore >= env.riskScoreThresholdBlock) {
    action = 'reject';
  } else if (clampedScore >= env.riskScoreThresholdWarn) {
    action = 'review';
  }

  return { score: clampedScore, flags, action };
};

const saveRiskEvent = async ({ attendanceAttemptId, studentId, sessionId, trustedDeviceId, ipAddress, riskScore, riskFlags, action }) => {
  return AttendanceRiskEvent.create({
    attendanceAttemptId,
    studentId,
    sessionId,
    trustedDeviceId,
    ipAddress,
    riskScore,
    riskFlags: JSON.stringify(riskFlags),
    action,
  });
};

const checkDevicePerSession = async (sessionId, trustedDeviceId, studentId) => {
  if (!trustedDeviceId) return { allowed: true };

  const existing = await AttendanceAttempt.findOne({
    where: {
      sessionId,
      trustedDeviceId,
      studentId: { [Op.ne]: studentId },
      status: { [Op.in]: ['present', 'late'] },
    },
  });

  if (existing) {
    return {
      allowed: false,
      message: 'This device has already been used to mark attendance for another student in this session.',
    };
  }

  return { allowed: true };
};

const getOrCreateDeviceFingerprint = (headers) => {
  const userAgent = headers['user-agent'] || '';
  const acceptLang = headers['accept-language'] || '';
  const secChUa = headers['sec-ch-ua'] || '';

  const raw = [userAgent, acceptLang, secChUa].join('|||');
  return crypto.createHash('sha256').update(raw).digest('hex');
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

module.exports = {
  buildQrChallenge,
  validateQrChallenge,
  markQrChallengeUsed,
  computeRiskScore,
  saveRiskEvent,
  checkDevicePerSession,
  getOrCreateDeviceFingerprint,
  distanceMeters,
  generateNonce,
  signPayload,
  verifySignature,
};
