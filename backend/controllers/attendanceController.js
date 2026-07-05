const { Op, UniqueConstraintError } = require('sequelize');
const { AbsenceQuery, Session, Attendance, Course, User, Enrollment, AttendanceAttempt, TrustedDevice } = require('../models');
const { haversineDistance, validateGpsAccuracy, validateLocationTimestamp, isMockedLocation, isInsideNigeriaBounds } = require('../utils/geoValidation');
const crypto = require('crypto');
const { sendEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');
const { broadcastNotification, buildNotificationPayload } = require('../utils/realtimeNotifications');
const env = require('../utils/env');
const {
  validateQrChallenge,
  markQrChallengeUsed,
  getOrCreateDeviceFingerprint,
  computeRiskScore,
  saveRiskEvent,
  checkDevicePerSession,
  buildQrChallenge,
} = require('../services/attendanceSecurityService');

const generateSessionKey = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 6; i++) {
    key += chars[crypto.randomInt(chars.length)];
  }
  return key;
};

const SESSION_SUMMARY_ATTRIBUTES = ['id', 'courseId', 'lecturerId', 'sessionKey', 'date', 'startTime', 'endTime', 'venue', 'status', 'maxAttendanceTime', 'lecturerLatitude', 'lecturerLongitude', 'lecturerLocationAccuracy', 'expiresAt', 'attendanceRadiusMeters', 'createdAt', 'updatedAt'];
const APP_TIMEZONE = 'Africa/Lagos';

const buildEndTime = (startTime, durationMinutes) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = String(Math.floor((totalMinutes / 60) % 24)).padStart(2, '0');
  const endMinutes = String(totalMinutes % 60).padStart(2, '0');
  return `${endHours}:${endMinutes}:00`;
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

const toDateKey = (value) => String(value || '').slice(0, 10);

const parseClockMinutes = (timeValue) => {
  const [hours = '0', minutes = '0'] = String(timeValue || '00:00:00').split(':');
  return (Number(hours) * 60) + Number(minutes);
};

const getCurrentLagosTimeParts = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) * 60) + Number(parts.minute),
    timeLabel: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
};

const buildDeviceFingerprint = (req) => getOrCreateDeviceFingerprint(req.headers);

const buildQrPayload = (sessionId, sessionKey) => JSON.stringify({
  type: 'attendance-session',
  sessionId: String(sessionId),
  sessionKey,
});

const parseQrPayload = (raw) => {
  if (!raw) return null;
  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (parsed?.type === 'attendance-session' && parsed?.sessionKey) {
      return { sessionId: parsed.sessionId, sessionKey: parsed.sessionKey };
    }
    return null;
  } catch {
    return null;
  }
};

exports.createSession = async (req, res) => {
  try {
    const {
      courseId,
      date,
      startTime,
      durationMinutes,
      venue,
      lecturerLatitude,
      lecturerLongitude,
      lecturerLocationAccuracy,
    } = req.body;

    if (!courseId || !date || !startTime) {
      return res.status(400).json({ success: false, message: 'courseId, date and startTime are required' });
    }

    if (lecturerLatitude === undefined || lecturerLongitude === undefined) {
      return res.status(400).json({ success: false, message: 'Lecturer location is required. Enable GPS and try again.' });
    }

    const parsedLat = Number(lecturerLatitude);
    const parsedLng = Number(lecturerLongitude);
    const parsedAccuracy = lecturerLocationAccuracy === undefined || lecturerLocationAccuracy === null
      ? null
      : Number(lecturerLocationAccuracy);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      return res.status(400).json({ success: false, message: 'Invalid lecturer location coordinates.' });
    }

    if (parsedAccuracy !== null) {
      const maxAccuracy = env.attendanceMaxLocationAccuracy;
      if (parsedAccuracy > maxAccuracy) {
        return res.status(403).json({ success: false, message: `Your location signal is not accurate enough (${Math.round(parsedAccuracy)}m). Move to an open area and try again.` });
      }
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'lecturer' && course.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const resolvedDuration = Number(durationMinutes || 120);
    const resolvedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;

    let sessionKey;
    let isUnique = false;
    while (!isUnique) {
      sessionKey = generateSessionKey();
      const existing = await Session.findOne({ where: { sessionKey } });
      if (!existing) isUnique = true;
    }

    const expiresAt = new Date(Date.now() + resolvedDuration * 60 * 1000);
    const attendanceRadius = env.attendanceRadiusMeters;

    const session = await Session.create({
      courseId,
      lecturerId: course.lecturerId,
      date,
      startTime: resolvedStartTime,
      endTime: buildEndTime(resolvedStartTime, resolvedDuration),
      sessionKey,
      venue: venue || course.courseName || '',
      status: 'active',
      maxAttendanceTime: 0,
      lecturerLatitude: parsedLat,
      lecturerLongitude: parsedLng,
      lecturerLocationAccuracy: parsedAccuracy,
      expiresAt,
      attendanceRadiusMeters: attendanceRadius,
    });

    const qrPayload = buildQrPayload(session.id, sessionKey);
    session.qrToken = qrPayload;
    await session.save();

    if (!env.isProduction) {
      console.log('[dev] QR payload generated:', qrPayload);
    }

    await logAuditEvent({
      req,
      action: 'attendance.session.created',
      targetType: 'session',
      targetId: session.id,
      campus: course.campus || null,
      faculty: course.faculty || null,
      department: course.department || null,
      metadata: {
        courseId: course.id,
        courseCode: course.courseCode,
        date,
        startTime: session.startTime,
        endTime: session.endTime,
        expiresAt,
        hasLocation: true,
        radiusMeters: attendanceRadius,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: {
        session,
        sessionKey,
        qrPayload,
        qrTokenExpiresAt: expiresAt,
        expiresAt,
        attendanceRadiusMeters: attendanceRadius,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    if (!['lecturer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view attendance sessions' });
    }

    const where = req.user.role === 'lecturer' ? { lecturerId: req.user.id } : {};
    const sessions = await Session.findAll({
      attributes: SESSION_SUMMARY_ATTRIBUTES,
      where,
      include: [{ model: Course, as: 'course', attributes: ['id', 'courseCode', 'courseName'] }],
      order: [['date', 'DESC'], ['startTime', 'DESC']]
    });
    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSession = async (req, res) => {
  try {
    if (!['lecturer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view attendance session details' });
    }

    const session = await Session.findByPk(req.params.id, {
      attributes: SESSION_SUMMARY_ATTRIBUTES,
      include: [
        { model: Course, as: 'course' },
        {
          model: Attendance,
          as: 'attendances',
          include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'matricNumber', 'email', 'department', 'faculty', 'program'] }]
        },
        {
          model: AbsenceQuery,
          as: 'queries',
          include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'matricNumber', 'email'] }]
        }
      ]
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (req.user.role === 'lecturer' && session.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const enrollments = await findEnrollmentsForCourse(session.course, { includeStudent: true });

    const presentStudentIds = new Set(session.attendances.map((attendance) => attendance.studentId));
    const absentStudents = enrollments
      .filter((entry) => !presentStudentIds.has(entry.userId))
      .map((entry) => entry.student);
    const markedStudents = session.attendances.length;
    const qrPayload = session.status === 'active' && session.sessionKey && session.expiresAt && new Date(session.expiresAt) > new Date()
      ? buildQrPayload(session.id, session.sessionKey)
      : null;

    const payload = {
      ...session.toJSON(),
      qrPayload,
      qrToken: qrPayload,
      qrTokenExpiresAt: session.expiresAt || null,
      attendanceStats: {
        expectedCount: enrollments.length,
        markedCount: markedStudents,
        presentCount: session.attendances.filter((entry) => entry.status === 'present').length,
        lateCount: session.attendances.filter((entry) => entry.status === 'late').length,
        absentCount: absentStudents.length,
        queryCount: session.queries.length,
      },
      enrolledStudents: enrollments.map((entry) => entry.student),
      absentStudents,
    };

    res.json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const { sessionKey, courseCode, method, latitude, longitude, accuracy, locationTimestamp, qrChallenge } = req.body;
    const deviceInfo = req.body.deviceInfo;

    if (!sessionKey) {
      return res.status(400).json({
        success: false,
        message: 'Scan the QR code or enter the session key with your course code to mark attendance.',
      });
    }

    const trimmedKey = String(sessionKey).trim().toUpperCase();
    const attendanceMethod = method === 'qr' ? 'qr' : 'key';

    const session = await Session.findOne({ where: { sessionKey: trimmedKey } });
    if (!session) {
      return res.status(404).json({ success: false, message: 'The session key is invalid.' });
    }

    const course = await Course.findByPk(session.courseId, { attributes: ['id', 'courseCode', 'courseName', 'semester', 'academicYear', 'campus', 'faculty', 'department'] });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (session.status !== 'active') {
      return res.status(403).json({ success: false, message: 'This attendance session has expired.' });
    }

    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      session.status = 'closed';
      await session.save();
      return res.status(403).json({ success: false, message: 'This attendance session has expired.' });
    }

    if (!env.isProduction) {
      console.log(`[dev] markAttendance: sessionKey=${trimmedKey}, method=${attendanceMethod}, latitude=${latitude}, longitude=${longitude}, accuracy=${accuracy}`);
    }

    // Step 1: Duplicate check
    const existing = await Attendance.findOne({ where: { sessionId: session.id, studentId: req.user.id } });
    if (existing) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.duplicate',
        targetType: 'attendance',
        targetId: existing.id,
        metadata: { sessionId: session.id, courseId: session.courseId, status: existing.status },
      });
      return res.status(200).json({
        success: true,
        message: 'You have already marked attendance for this session.',
        data: existing,
      });
    }

    // Step 2: Enrollment check
    const enrollment = await Enrollment.findOne({
      where: {
        userId: req.user.id,
        courseId: session.courseId,
        status: 'active',
        [Op.or]: [
          { semester: course?.semester || null, academicYear: course?.academicYear || null },
          { courseId: session.courseId, userId: req.user.id, status: 'active' },
        ],
      },
    });

    if (!enrollment) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.rejected.not_enrolled',
        targetType: 'session', targetId: session.id,
        metadata: { courseId: session.courseId },
      });
      return res.status(403).json({ success: false, message: 'You are not registered for this course, so attendance cannot be marked.' });
    }

    // Step 3: Location provided
    if (latitude === undefined || longitude === undefined) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.rejected.location_missing',
        targetType: 'session', targetId: session.id,
        metadata: { courseId: session.courseId },
      });
      return res.status(403).json({ success: false, message: 'Location permission is required. Enable GPS and try again.' });
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedAccuracy = accuracy === undefined || accuracy === null || accuracy === '' ? null : Number(accuracy);

    if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
      return res.status(400).json({ success: false, message: 'Invalid location coordinates supplied.' });
    }

    // Step 4: Bounds check
    if (!isInsideNigeriaBounds(parsedLatitude, parsedLongitude)) {
      return res.status(403).json({ success: false, message: 'Your GPS coordinates appear to be outside Nigeria. Attendance cannot be marked.' });
    }

    // Step 5: Accuracy check
    if (parsedAccuracy !== null) {
      const maxAccuracy = env.attendanceMaxLocationAccuracy;
      if (parsedAccuracy > maxAccuracy) {
        return res.status(403).json({ success: false, message: `Your location signal is not accurate enough (${Math.round(parsedAccuracy)}m). Move to an open area and try again.` });
      }
    }

    // Step 6: Location timestamp freshness
    if (locationTimestamp) {
      const timeCheck = validateLocationTimestamp(locationTimestamp);
      if (!timeCheck.valid) {
        return res.status(403).json({ success: false, message: timeCheck.reason });
      }
    }

    // Step 7: Mock location check
    if (isMockedLocation(parsedLatitude, parsedLongitude, parsedAccuracy, locationTimestamp, deviceInfo)) {
      await logAuditEvent({
        req, action: 'attendance.mark.rejected.mock_location',
        targetType: 'session', targetId: session.id,
        metadata: { courseId: session.courseId, latitude: parsedLatitude, longitude: parsedLongitude },
      });
      return res.status(403).json({ success: false, message: 'Suspicious location detected. Turn off any location simulation apps and try again.' });
    }

    // Step 8: QR challenge validation
    if (attendanceMethod === 'qr' && qrChallenge) {
      const qrResult = await validateQrChallenge(qrChallenge);
      if (!qrResult.valid) {
        await logAuditEvent({
          req, action: 'attendance.mark.rejected.invalid_qr',
          targetType: 'session', targetId: session.id,
          metadata: { courseId: session.courseId, reason: qrResult.reason },
        });
        return res.status(403).json({ success: false, message: qrResult.reason });
      }
    }

    // Step 9: Distance calculation
    const hasLecturerLocation = session.lecturerLatitude !== null && session.lecturerLongitude !== null;
    const radiusMeters = session.attendanceRadiusMeters || env.attendanceRadiusMeters;

    let distanceMetersValue;
    let centerLat;
    let centerLng;

    if (hasLecturerLocation) {
      centerLat = Number(session.lecturerLatitude);
      centerLng = Number(session.lecturerLongitude);
    } else {
      centerLat = Number(session.geofenceLatitude);
      centerLng = Number(session.geofenceLongitude);
    }

    distanceMetersValue = Math.round(distanceMeters(parsedLatitude, parsedLongitude, centerLat, centerLng));
    const insideRadius = distanceMetersValue <= radiusMeters;

    if (!env.isProduction) {
      console.log(`[dev] Attendance distance: ${distanceMetersValue}m (radius: ${radiusMeters}m, inside: ${insideRadius})`);
    }

    // Step 10: Device fingerprint & trusted device
    const deviceHash = buildDeviceFingerprint(req);
    const currentIp = req.ip || req.get('x-forwarded-for') || req.connection?.remoteAddress || null;

    const trustedDevice = await TrustedDevice.findOne({
      where: { userId: req.user.id, deviceFingerprint: deviceHash, status: 'active' },
    });

    if (trustedDevice) {
      const deviceCheck = await checkDevicePerSession(session.id, trustedDevice.id, req.user.id);
      if (!deviceCheck.allowed) {
        await logAuditEvent({
          req, action: 'attendance.mark.rejected.device_conflict',
          targetType: 'session', targetId: session.id,
          metadata: { courseId: session.courseId, trustedDeviceId: trustedDevice.id },
        });
        return res.status(403).json({ success: false, message: deviceCheck.message });
      }
    }

    // Step 11: Build attempt record
    const previousAttempts = await AttendanceAttempt.count({
      where: { studentId: req.user.id, sessionId: session.id },
    });
    const attemptNumber = previousAttempts + 1;

    const attemptPayload = {
      studentId: req.user.id,
      sessionId: session.id,
      courseId: session.courseId,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      accuracy: parsedAccuracy,
      deviceInfo: req.get('user-agent') || null,
      locationTimestamp: locationTimestamp ? new Date(locationTimestamp) : null,
      attemptNumber,
      attendanceMethod,
      trustedDeviceId: trustedDevice?.id || null,
      metadata: { distanceMeters: distanceMetersValue },
    };

    // Step 12: Outside radius handling
    if (!insideRadius) {
      attemptPayload.accepted = false;
      attemptPayload.rejectionReason = `You are outside the required ${radiusMeters}-metre attendance radius. Your distance is ${distanceMetersValue}m.`;

      await AttendanceAttempt.create(attemptPayload);

      await logAuditEvent({
        req, action: 'attendance.mark.rejected.outside_radius',
        targetType: 'session', targetId: session.id,
        metadata: { courseId: session.courseId, distanceMeters: distanceMetersValue, allowedRadiusMeters: radiusMeters, attemptNumber },
      });

      if (attemptNumber < 2) {
        return res.status(403).json({
          success: false,
          message: `You are outside the required ${radiusMeters}-metre attendance radius. Move closer to the lecturer and try again. You have one attempt remaining.`,
          data: { distanceMeters: distanceMetersValue, radiusMeters, attemptNumber, canRetry: true },
        });
      }

      attemptPayload.accepted = true;
      const attempt = await AttendanceAttempt.create(attemptPayload);

      // Risk score for late marking
      const riskResult = await computeRiskScore({
        studentId: req.user.id,
        sessionId: session.id,
        trustedDeviceId: trustedDevice?.id || null,
        ipAddress: currentIp,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        accuracy: parsedAccuracy,
        locationTimestamp,
      });

      if (riskResult.action === 'reject') {
        await saveRiskEvent({
          attendanceAttemptId: attempt.id,
          studentId: req.user.id,
          sessionId: session.id,
          trustedDeviceId: trustedDevice?.id || null,
          ipAddress: currentIp,
          riskScore: riskResult.score,
          riskFlags: riskResult.flags,
          action: 'reject',
        });

        await logAuditEvent({
          req, action: 'attendance.mark.rejected.risk_score',
          targetType: 'attendance_attempt', targetId: attempt.id,
          metadata: { sessionId: session.id, courseId: session.courseId, riskScore: riskResult.score, riskFlags: riskResult.flags },
        });

        return res.status(403).json({
          success: false,
          message: 'Your attendance attempt was flagged by our security system. Please contact your lecturer.',
        });
      }

      let attendance;
      try {
        attendance = await Attendance.create({
          sessionId: session.id,
          studentId: req.user.id,
          courseId: session.courseId,
          status: 'late',
          markedAt: new Date(),
          markedBy: 'self',
          verificationMethod: attendanceMethod === 'qr' ? 'qr' : 'code',
          deviceInfo: req.get('user-agent') || null,
          location: `${parsedLatitude},${parsedLongitude}`,
          locationAccuracy: parsedAccuracy,
          distanceFromClass: distanceMetersValue,
          deviceFlagged: riskResult.action === 'review',
        });
      } catch (createError) {
        if (createError instanceof UniqueConstraintError) {
          const recordedAttendance = await Attendance.findOne({ where: { sessionId: session.id, studentId: req.user.id } });
          return res.status(200).json({ success: true, message: 'You have already marked attendance for this session.', data: recordedAttendance });
        }
        throw createError;
      }

      if (riskResult.action === 'review' || riskResult.flags.length > 0) {
        await saveRiskEvent({
          attendanceAttemptId: attempt.id,
          studentId: req.user.id,
          sessionId: session.id,
          trustedDeviceId: trustedDevice?.id || null,
          ipAddress: currentIp,
          riskScore: riskResult.score,
          riskFlags: riskResult.flags,
          action: riskResult.action,
        });
      }

      if (qrChallenge && qrChallenge.nonce) {
        await markQrChallengeUsed(qrChallenge.nonce, req.user.id).catch(() => {});
      }

      await logAuditEvent({
        req, action: 'attendance.marked',
        targetType: 'attendance', targetId: attendance.id,
        campus: course?.campus || null, faculty: course?.faculty || null, department: course?.department || null,
        metadata: { sessionId: session.id, courseId: session.courseId, status: 'late', distanceFromClass: distanceMetersValue, attemptNumber, riskScore: riskResult.score },
      });

      return res.status(201).json({
        success: true,
        message: `You are outside the ${radiusMeters}-metre radius. Your attendance has been marked as late.`,
        data: { attendance, distanceMeters: distanceMetersValue, status: 'late' },
      });
    }

    // Step 13: Inside radius — create attempt
    attemptPayload.accepted = true;
    const attempt = await AttendanceAttempt.create(attemptPayload);

    // Step 14: Risk scoring
    const riskResult = await computeRiskScore({
      studentId: req.user.id,
      sessionId: session.id,
      trustedDeviceId: trustedDevice?.id || null,
      ipAddress: currentIp,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      accuracy: parsedAccuracy,
      locationTimestamp,
    });

    if (riskResult.action === 'reject') {
      await saveRiskEvent({
        attendanceAttemptId: attempt.id,
        studentId: req.user.id,
        sessionId: session.id,
        trustedDeviceId: trustedDevice?.id || null,
        ipAddress: currentIp,
        riskScore: riskResult.score,
        riskFlags: riskResult.flags,
        action: 'reject',
      });

      await logAuditEvent({
        req, action: 'attendance.mark.rejected.risk_score',
        targetType: 'attendance_attempt', targetId: attempt.id,
        metadata: { sessionId: session.id, courseId: session.courseId, riskScore: riskResult.score, riskFlags: riskResult.flags },
      });

      return res.status(403).json({
        success: false,
        message: 'Your attendance attempt was flagged by our security system. Please contact your lecturer.',
      });
    }

    // Step 15: Create attendance record
    const deviceFlagged = Boolean(
      riskResult.action === 'review' || (trustedDevice === null && riskResult.flags.includes('untrusted_device'))
    );

    let attendance;
    try {
      attendance = await Attendance.create({
        sessionId: session.id,
        studentId: req.user.id,
        courseId: session.courseId,
        status: 'present',
        markedAt: new Date(),
        markedBy: 'self',
        verificationMethod: attendanceMethod === 'qr' ? 'qr' : 'code',
        deviceInfo: req.get('user-agent') || null,
        location: `${parsedLatitude},${parsedLongitude}`,
        locationAccuracy: parsedAccuracy,
        distanceFromClass: distanceMetersValue,
        deviceFlagged,
      });
    } catch (createError) {
      if (createError instanceof UniqueConstraintError) {
        const recordedAttendance = await Attendance.findOne({ where: { sessionId: session.id, studentId: req.user.id } });
        return res.status(200).json({ success: true, message: 'You have already marked attendance for this session.', data: recordedAttendance });
      }
      throw createError;
    }

    // Step 16: Mark QR challenge as used
    if (qrChallenge && qrChallenge.nonce) {
      await markQrChallengeUsed(qrChallenge.nonce, req.user.id).catch(() => {});
    }

    // Step 17: Save risk event if flagged
    if (riskResult.action === 'review' || riskResult.flags.length > 0) {
      await saveRiskEvent({
        attendanceAttemptId: attempt.id,
        studentId: req.user.id,
        sessionId: session.id,
        trustedDeviceId: trustedDevice?.id || null,
        ipAddress: currentIp,
        riskScore: riskResult.score,
        riskFlags: riskResult.flags,
        action: riskResult.action,
      });
    }

    // Step 18: Update user's known device/IP
    const student = await User.findByPk(req.user.id, { attributes: ['id', 'lastKnownDeviceHash', 'lastKnownIp'] });
    if (student) {
      student.lastKnownDeviceHash = deviceHash;
      student.lastKnownIp = currentIp;
      await student.save();
    }

    // Update trusted device last used
    if (trustedDevice) {
      trustedDevice.lastUsedAt = new Date();
      await trustedDevice.save().catch(() => {});
    }

    await logAuditEvent({
      req, action: 'attendance.marked',
      targetType: 'attendance', targetId: attendance.id,
      campus: course?.campus || null, faculty: course?.faculty || null, department: course?.department || null,
      metadata: { sessionId: session.id, courseId: session.courseId, status: 'present', distanceFromClass: distanceMetersValue, attemptNumber, deviceFlagged, riskScore: riskResult.score },
    });

    res.status(201).json({ success: true, message: 'Attendance marked successfully.', data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentHistory = async (req, res) => {
  try {
    const attendances = await Attendance.findAll({
      where: { studentId: req.user.id },
      include: [{ model: Session, as: 'session', include: [{ model: Course, as: 'course' }] }],
      order: [['markedAt', 'DESC']]
    });
    res.json({ success: true, data: attendances });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeSession = async (req, res) => {
  try {
    const session = await Session.findByPk(req.params.id, { include: [{ model: Course, as: 'course' }] });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (req.user.role === 'lecturer' && session.course?.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    session.status = 'closed';
    await session.save();

    const enrollments = await findEnrollmentsForCourse(session.course, { includeStudent: true });

    const attendances = await Attendance.findAll({
      where: { sessionId: session.id },
      attributes: ['studentId'],
    });

    const presentStudentIds = new Set(attendances.map((entry) => entry.studentId));
    const absentEnrollments = enrollments.filter((entry) => !presentStudentIds.has(entry.userId));

    for (const enrollment of absentEnrollments) {
      const existingQuery = await AbsenceQuery.findOne({
        where: { sessionId: session.id, studentId: enrollment.userId },
      });

      if (!existingQuery) {
        const query = await AbsenceQuery.create({
          lecturerId: session.lecturerId,
          studentId: enrollment.userId,
          sessionId: session.id,
          title: `Absence query for ${session.course?.courseCode || 'session'}`,
          message: `You were not marked present for the ${session.course?.courseName || 'class session'} held on ${session.date}. Please explain why you were absent.`,
          status: 'pending',
          escalationState: 'none',
        });

        try {
          if (enrollment.student?.email) {
            const lecturerName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || 'Your lecturer';
            await sendEmail({
              to: enrollment.student.email,
              subject: `Attendance System: Absence noted for ${session.course?.courseCode || 'your class'}`,
              text: `${lecturerName} has closed attendance for ${session.course?.courseCode || 'your class'} on ${session.date}. You were marked absent and an absence query was created.\n\nTitle: ${query.title}\n\nMessage: ${query.message}`,
              html: `<p>${lecturerName} has closed attendance for <strong>${session.course?.courseCode || 'your class'}</strong> on ${session.date}.</p><p>You were marked absent and an absence query was created for you.</p><p><strong>Title:</strong> ${query.title}</p><p>${query.message}</p>`,
            });
          }
        } catch (emailError) {
          console.warn(`Automatic absence email failed for student ${enrollment.userId}:`, emailError.message);
        }

        const io = req.app.get('io');
        const queryNotification = buildNotificationPayload({
          type: 'absence_query',
          title: 'Automatic absence query created',
          description: `${session.course?.courseCode || 'A course'} closed with ${enrollment.student?.firstName || 'a student'} marked absent.`,
          tone: 'amber',
          linkTab: 'queries',
          entityType: 'absence_query',
          entityId: query.id,
          meta: {
            queryId: query.id,
            sessionId: session.id,
            studentId: enrollment.userId,
            lecturerId: session.lecturerId,
          },
        });
        broadcastNotification(io, {
          userIds: [enrollment.userId, session.lecturerId],
          notification: queryNotification,
        });
      }
    }

    await logAuditEvent({
      req,
      action: 'attendance.session.closed',
      targetType: 'session',
      targetId: session.id,
      campus: session.course?.campus || null,
      faculty: session.course?.faculty || null,
      department: session.course?.department || null,
      metadata: {
        courseId: session.courseId,
        absentCount: absentEnrollments.length,
        markedCount: attendances.length,
      },
    });

    res.json({
      success: true,
      message: 'Session closed and absence queries sent automatically',
      data: {
        session,
        absentCount: absentEnrollments.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSessionLocation = async (req, res) => {
  try {
    const session = await Session.findByPk(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (req.user.role === 'lecturer' && session.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (session.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Session is not active' });
    }

    const { latitude, longitude, accuracy } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const parsedLat = Number(latitude);
    const parsedLng = Number(longitude);
    const parsedAccuracy = accuracy === undefined || accuracy === null ? null : Number(accuracy);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    if (parsedAccuracy !== null) {
      const maxAccuracy = env.attendanceMaxLocationAccuracy;
      if (parsedAccuracy > maxAccuracy) {
        return res.status(403).json({ success: false, message: `Your location signal is not accurate enough (${Math.round(parsedAccuracy)}m). Move to an open area and try again.` });
      }
    }

    session.lecturerLatitude = parsedLat;
    session.lecturerLongitude = parsedLng;
    session.lecturerLocationAccuracy = parsedAccuracy;
    await session.save();

    res.json({ success: true, message: 'Location updated', data: { latitude: parsedLat, longitude: parsedLng, accuracy: parsedAccuracy } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAttemptLogs = async (req, res) => {
  try {
    const { sessionId, courseId, accepted, limit: queryLimit, offset } = req.query;

    if (!['lecturer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const where = {};
    if (sessionId) where.sessionId = sessionId;
    if (courseId) where.courseId = courseId;
    if (accepted === 'true' || accepted === 'false') where.accepted = accepted === 'true';

    if (req.user.role === 'lecturer') {
      const sessions = await Session.findAll({
        where: { lecturerId: req.user.id },
        attributes: ['id'],
      });
      const sessionIds = sessions.map((s) => s.id);
      if (!where.sessionId) {
        where.sessionId = sessionIds;
      } else if (!sessionIds.includes(Number(where.sessionId))) {
        return res.status(403).json({ success: false, message: 'Not authorized to view attempts for this session' });
      }
    }

    const attempts = await AttendanceAttempt.findAndCountAll({
      where,
      include: [
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'matricNumber', 'email'] },
        { model: Session, as: 'session', attributes: ['id', 'sessionKey', 'date', 'startTime', 'endTime'] },
        { model: Course, as: 'course', attributes: ['id', 'courseCode', 'courseName'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(queryLimit) || 100, 500),
      offset: Number(offset) || 0,
    });

    res.json({
      success: true,
      data: attempts.rows,
      total: attempts.count,
      limit: Math.min(Number(queryLimit) || 100, 500),
      offset: Number(offset) || 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQrChallenge = async (req, res) => {
  try {
    const session = await Session.findByPk(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    if (req.user.role === 'lecturer' && session.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    if (session.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Session is not active.' });
    }

    const challenge = await buildQrChallenge(session.id, session.sessionKey);

    res.json({ success: true, data: challenge });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
