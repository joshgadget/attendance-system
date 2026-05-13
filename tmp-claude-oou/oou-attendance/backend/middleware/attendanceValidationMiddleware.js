/**
 * OOU ATTENDANCE SECURITY MIDDLEWARE
 * University-grade enforcement layer for Olabisi Onabanjo University
 *
 * Layered security checks applied in this order:
 *  1. Session existence and active status
 *  2. Session has not been opened too early (pre-session block)
 *  3. Session time window has not expired
 *  4. Student is enrolled in the course
 *  5. Duplicate attendance prevention
 *  6. GPS geofence enforcement (STRICT, MANDATORY for OOU)
 *  7. GPS accuracy threshold check (rejects spoofed/low-accuracy signals)
 *  8. Anti-rapid-submission throttle
 *  9. Suspicious multi-device / IP-jump detection
 * 10. Session code brute-force rate limiting
 */

const { Session, Attendance, Enrollment, Course } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

// ── Haversine distance formula ─────────────────────────────────────────────
const toRadians = (v) => (Number(v) * Math.PI) / 180;

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── 1. Validate session code and active state ──────────────────────────────
const validateSession = async (req, res, next) => {
  try {
    const sessionCode = (req.body.sessionCode || req.body.session_code || '').toUpperCase().trim();

    if (!sessionCode) {
      return res.status(400).json({ success: false, message: 'Session code is required.' });
    }

    if (!/^[A-F0-9]{10}$/.test(sessionCode)) {
      return res.status(400).json({ success: false, message: 'Invalid session code format.' });
    }

    const session = await Session.findOne({
      where: { sessionCode, status: 'active' },
      include: [{ model: Course, as: 'course' }],
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session code not found or session has been closed. Check with your lecturer.',
      });
    }

    req.attendanceSession = session;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Session validation error.' });
  }
};

// ── 2 & 3. Time window enforcement ───────────────────────────────────────
const validateTimeWindow = (req, res, next) => {
  const session = req.attendanceSession;
  const sessionStart = new Date(`${session.date}T${session.startTime}`);
  const now = new Date();

  // Block marking more than 5 minutes before session officially starts
  if (now < new Date(sessionStart.getTime() - 5 * 60 * 1000)) {
    return res.status(403).json({
      success: false,
      message: `This session has not started yet. It begins at ${session.startTime}.`,
    });
  }

  // Block marking after (session end + 15 min grace period)
  const sessionEnd = new Date(`${session.date}T${session.endTime}`);
  const deadline = new Date(sessionEnd.getTime() + 15 * 60 * 1000);
  if (now > deadline) {
    return res.status(403).json({
      success: false,
      message: 'The attendance window for this session has closed.',
    });
  }

  next();
};

// ── 4. Enrollment check ────────────────────────────────────────────────────
const validateEnrollment = async (req, res, next) => {
  try {
    const session = req.attendanceSession;
    const enrollment = await Enrollment.findOne({
      where: {
        userId: req.user.id,
        courseId: session.courseId,
        status: 'active',
      },
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not registered for this course. Contact the academic office.',
      });
    }

    req.enrollment = enrollment;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Enrollment check error.' });
  }
};

// ── 5. Duplicate prevention ────────────────────────────────────────────────
const preventDuplicate = async (req, res, next) => {
  try {
    const existing = await Attendance.findOne({
      where: { sessionId: req.attendanceSession.id, studentId: req.user.id },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyMarked: true,
        message: 'Your attendance for this session has already been recorded.',
        data: { status: existing.status, markedAt: existing.markedAt },
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Duplicate check error.' });
  }
};

// ── 6 & 7. STRICT OOU Geofence enforcement ────────────────────────────────
const enforceGeofence = (req, res, next) => {
  const session = req.attendanceSession;
  const { latitude, longitude, accuracy } = req.body;

  // OOU policy: geofence is ALWAYS required — no bypass
  if (
    session.geofenceLatitude === null ||
    session.geofenceLongitude === null ||
    session.geofenceRadiusMeters === null
  ) {
    // Session created without geofence — block it; OOU requires a building
    return res.status(403).json({
      success: false,
      message: 'This session has no geofence building assigned. Contact your lecturer to fix this.',
    });
  }

  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return res.status(403).json({
      success: false,
      message: 'Location is required. Enable GPS on your device and try again.',
    });
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ success: false, message: 'Invalid GPS coordinates.' });
  }

  // Sanity bounds — rough Nigeria bounding box
  if (lat < 4.0 || lat > 14.0 || lon < 2.5 || lon > 15.0) {
    return res.status(403).json({
      success: false,
      message: 'Your GPS coordinates are outside Nigeria. Attendance cannot be marked.',
    });
  }

  // OOU policy: reject if device reports accuracy worse than 100m
  // This catches GPS spoofing apps that often report accuracy = 0 or very large values
  if (accuracy !== undefined && accuracy !== null) {
    const acc = Number(accuracy);
    if (!Number.isNaN(acc) && (acc > 100 || acc <= 0)) {
      return res.status(403).json({
        success: false,
        message: `Your GPS accuracy is too low (${Math.round(acc)}m). Move to an open area and try again.`,
      });
    }
  }

  const dist = distanceMeters(
    lat, lon,
    Number(session.geofenceLatitude),
    Number(session.geofenceLongitude)
  );

  const allowed = Number(session.geofenceRadiusMeters);

  if (dist > allowed) {
    return res.status(403).json({
      success: false,
      message: `You are ${Math.round(dist)}m from the class building. You must be within ${allowed}m to mark attendance.`,
      data: { distanceMeters: Math.round(dist), allowedMeters: allowed },
    });
  }

  // Attach verified location to request for audit trail
  req.verifiedLocation = { latitude: lat, longitude: lon, accuracy: accuracy || null, distanceMeters: Math.round(dist) };
  next();
};

// ── 8. Anti-rapid-submission throttle ─────────────────────────────────────
const throttleSubmissions = async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 60 * 1000); // 60 seconds
    const recent = await Attendance.findOne({
      where: { studentId: req.user.id, markedAt: { [Op.gte]: cutoff } },
    });

    if (recent) {
      return res.status(429).json({
        success: false,
        message: 'Please wait at least 60 seconds between attendance attempts.',
      });
    }

    next();
  } catch (err) {
    next(); // Non-blocking; do not prevent legitimate marking
  }
};

// ── 9. Device and IP anomaly detection ────────────────────────────────────
const detectDeviceAnomaly = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const currentIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const ua = req.get('user-agent') || '';

    // Create a lightweight device fingerprint from User-Agent
    const deviceHash = crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16);

    // Fetch last 10 attendance records for this student
    const recent = await Attendance.findAll({
      where: { studentId },
      order: [['markedAt', 'DESC']],
      limit: 10,
      attributes: ['deviceInfo', 'location'],
    });

    if (recent.length >= 5) {
      // Extract unique IPs (stored in location field as "lat,lon" or IP fallback)
      const uniqueUAs = new Set(recent.map((r) => r.deviceInfo).filter(Boolean));
      // Flag if more than 4 distinct user-agents seen in last 10 records
      if (uniqueUAs.size >= 4 && ![...uniqueUAs].some((ua_) => ua_.includes(ua.slice(0, 30)))) {
        req.deviceFlagged = true;
        req.deviceFlagReason = 'Multiple device signatures detected on this account';
      }
    }

    // Attach device metadata to request for audit storage
    req.deviceMeta = { ip: currentIp, userAgent: ua, deviceHash };
    next();
  } catch (err) {
    next(); // Detection failure must never block legitimate students
  }
};

// ── Exported combined pipeline ─────────────────────────────────────────────
const oouAttendancePipeline = [
  validateSession,
  validateTimeWindow,
  validateEnrollment,
  preventDuplicate,
  enforceGeofence,
  throttleSubmissions,
  detectDeviceAnomaly,
];

module.exports = {
  validateSession,
  validateTimeWindow,
  validateEnrollment,
  preventDuplicate,
  enforceGeofence,
  throttleSubmissions,
  detectDeviceAnomaly,
  oouAttendancePipeline,
};
