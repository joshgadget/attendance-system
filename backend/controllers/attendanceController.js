const jwt = require('jsonwebtoken');
const { Op, UniqueConstraintError } = require('sequelize');
const { AbsenceQuery, Session, Attendance, Course, User, Enrollment, AttendanceAttempt } = require('../models');
const { haversineDistance, validateGpsAccuracy, validateLocationTimestamp, isMockedLocation, isInsideNigeriaBounds } = require('../utils/geoValidation');
const crypto = require('crypto');
const authConfig = require('../config/auth');
const { sendEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');
const { broadcastNotification, buildNotificationPayload } = require('../utils/realtimeNotifications');

const generateSessionCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();
const generateSessionKey = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 6; i++) {
    key += chars[crypto.randomInt(chars.length)];
  }
  return key;
};
const SESSION_SUMMARY_ATTRIBUTES = ['id', 'courseId', 'lecturerId', 'sessionCode', 'sessionKey', 'date', 'startTime', 'endTime', 'venue', 'status', 'maxAttendanceTime', 'lecturerLatitude', 'lecturerLongitude', 'lecturerLocationAccuracy', 'expiresAt', 'attendanceRadiusMeters', 'createdAt', 'updatedAt'];
const ATTENDANCE_RADIUS_METERS = 35;
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

const buildDeviceFingerprint = (req) => crypto
  .createHash('sha256')
  .update(req.get('user-agent') || 'unknown-device')
  .digest('hex')
  .slice(0, 32);

const signQrToken = (sessionId, sessionKey, ttlSeconds) => {
  const token = jwt.sign({ t: 'att', sid: sessionId, key: sessionKey }, authConfig.jwt.secret, {
    expiresIn: ttlSeconds,
  });
  const decoded = jwt.decode(token);
  return {
    token,
    expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
  };
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

    const accuracyCheck = validateGpsAccuracy(parsedAccuracy);
    if (!accuracyCheck.valid) {
      return res.status(403).json({ success: false, message: `Your location accuracy is too low. ${accuracyCheck.reason}` });
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

    let sessionCode;
    let isUnique = false;
    while (!isUnique) {
      sessionCode = generateSessionCode();
      const existing = await Session.findOne({ where: { sessionCode } });
      if (!existing) isUnique = true;
    }

    let sessionKey;
    let keyUnique = false;
    while (!keyUnique) {
      sessionKey = generateSessionKey();
      const existing = await Session.findOne({ where: { sessionKey } });
      if (!existing) keyUnique = true;
    }

    const expiresAt = new Date(Date.now() + resolvedDuration * 60 * 1000);
    const qrBundle = signQrToken(null, null, resolvedDuration * 60); // placeholder, we sign with real id after create
    const attendanceRadius = ATTENDANCE_RADIUS_METERS;

    const session = await Session.create({
      courseId,
      lecturerId: course.lecturerId,
      date,
      startTime: resolvedStartTime,
      endTime: buildEndTime(resolvedStartTime, resolvedDuration),
      sessionCode,
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

    // Sign the QR token with the real session id
    const qrToken = signQrToken(session.id, sessionKey, resolvedDuration * 60);
    session.qrToken = qrToken.token;
    await session.save();

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
        sessionCode,
        sessionKey,
        qrToken: qrToken.token,
        qrTokenExpiresAt: qrToken.expiresAt,
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
    const qrBundle = session.status === 'active' && session.sessionKey && session.expiresAt && new Date(session.expiresAt) > new Date()
      ? signQrToken(session.id, session.sessionKey, Math.max(60, Math.floor((new Date(session.expiresAt) - Date.now()) / 1000)))
      : null;

    const payload = {
      ...session.toJSON(),
      qrToken: qrBundle?.token || null,
      qrTokenExpiresAt: qrBundle?.expiresAt || null,
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
    const { attendancePass, sessionKey, courseCode, latitude, longitude, accuracy } = req.body;
    const { locationTimestamp, deviceInfo } = req.body;

    let session;
    let course;
    let attendanceMethod;

    if (attendancePass) {
      // Mode 1: QR code scan - attendancePass is a JWT
      attendanceMethod = 'qr';
      let decoded;
      try {
        decoded = jwt.verify(attendancePass, authConfig.jwt.secret);
      } catch {
        return res.status(403).json({ success: false, message: 'This QR code is invalid or has expired.' });
      }

      if (decoded?.t !== 'att' || !decoded?.sid || !decoded?.key) {
        return res.status(403).json({ success: false, message: 'This QR code is invalid or has expired.' });
      }

      session = await Session.findByPk(decoded.sid);
      if (!session) {
        return res.status(404).json({ success: false, message: 'This attendance session could not be found.' });
      }

      if (session.sessionKey !== decoded.key) {
        return res.status(403).json({ success: false, message: 'This QR code is invalid or has expired.' });
      }
    } else if (sessionKey && courseCode) {
      // Mode 2: Manual entry - sessionKey + courseCode
      attendanceMethod = 'key';
      session = await Session.findOne({ where: { sessionKey: String(sessionKey).trim().toUpperCase() } });
      if (!session) {
        return res.status(404).json({ success: false, message: 'The session key is invalid.' });
      }

      course = await Course.findByPk(session.courseId);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found.' });
      }

      const normalizedCourseCode = String(courseCode || '').trim().toUpperCase();
      const sessionCourseCode = String(course.courseCode || '').trim().toUpperCase();
      if (normalizedCourseCode !== sessionCourseCode) {
        return res.status(403).json({ success: false, message: 'The course code does not match this attendance session.' });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Scan the QR code or enter the session key with your course code to mark attendance.',
      });
    }

    // Find course if not already fetched
    if (!course) {
      course = await Course.findByPk(session.courseId, { attributes: ['id', 'courseCode', 'semester', 'academicYear', 'campus', 'faculty', 'department'] });
    }

    // Check session is active
    if (session.status !== 'active') {
      return res.status(403).json({ success: false, message: 'This attendance session has expired.' });
    }

    // Check session has not expired
    if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
      session.status = 'closed';
      await session.save();
      return res.status(403).json({ success: false, message: 'This attendance session has expired.' });
    }

    // Check duplicate attendance
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

    // Check enrollment
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

    // Validate GPS location
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

    if (!isInsideNigeriaBounds(parsedLatitude, parsedLongitude)) {
      return res.status(403).json({ success: false, message: 'Your GPS coordinates appear to be outside Nigeria. Attendance cannot be marked.' });
    }

    const accuracyCheck = validateGpsAccuracy(parsedAccuracy);
    if (!accuracyCheck.valid) {
      return res.status(403).json({ success: false, message: accuracyCheck.reason });
    }

    if (locationTimestamp) {
      const timeCheck = validateLocationTimestamp(locationTimestamp);
      if (!timeCheck.valid) {
        return res.status(403).json({ success: false, message: timeCheck.reason });
      }
    }

    if (isMockedLocation(parsedLatitude, parsedLongitude, parsedAccuracy, locationTimestamp, deviceInfo)) {
      await logAuditEvent({
        req, action: 'attendance.mark.rejected.mock_location',
        targetType: 'session', targetId: session.id,
        metadata: { courseId: session.courseId, latitude: parsedLatitude, longitude: parsedLongitude },
      });
      return res.status(403).json({ success: false, message: 'Suspicious location detected. Turn off any location simulation apps and try again.' });
    }

    // Calculate distance from lecturer's saved location
    // If session has lecturerLatitude (new-style), use that; otherwise fall back to geofenceLatitude
    const hasLecturerLocation = session.lecturerLatitude !== null && session.lecturerLongitude !== null;
    const radiusMeters = session.attendanceRadiusMeters || ATTENDANCE_RADIUS_METERS;

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

    // Check previous attempt count
    const previousAttempts = await AttendanceAttempt.count({
      where: { studentId: req.user.id, sessionId: session.id },
    });
    const attemptNumber = previousAttempts + 1;

    // Create attempt log
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
    };

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

      // Second attempt and still outside: mark as late
      attemptPayload.accepted = true;
      await AttendanceAttempt.create(attemptPayload);

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
        });
      } catch (createError) {
        if (createError instanceof UniqueConstraintError) {
          const recordedAttendance = await Attendance.findOne({ where: { sessionId: session.id, studentId: req.user.id } });
          return res.status(200).json({ success: true, message: 'You have already marked attendance for this session.', data: recordedAttendance });
        }
        throw createError;
      }

      await logAuditEvent({
        req, action: 'attendance.marked',
        targetType: 'attendance', targetId: attendance.id,
        campus: course?.campus || null, faculty: course?.faculty || null, department: course?.department || null,
        metadata: { sessionId: session.id, courseId: session.courseId, status: 'late', distanceFromClass: distanceMetersValue, attemptNumber },
      });

      return res.status(201).json({
        success: true,
        message: `You are outside the ${radiusMeters}-metre radius. Your attendance has been marked as late.`,
        data: { attendance, distanceMeters: distanceMetersValue, status: 'late' },
      });
    }

    // Inside radius: mark as present
    attemptPayload.accepted = true;
    await AttendanceAttempt.create(attemptPayload);

    const student = await User.findByPk(req.user.id, { attributes: ['id', 'lastKnownDeviceHash', 'lastKnownIp'] });
    const deviceHash = buildDeviceFingerprint(req);
    const currentIp = req.ip || req.get('x-forwarded-for') || req.connection?.remoteAddress || null;
    const deviceFlagged = Boolean(
      student && student.lastKnownDeviceHash && student.lastKnownIp &&
      student.lastKnownDeviceHash !== deviceHash && student.lastKnownIp !== currentIp
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

    if (student) {
      student.lastKnownDeviceHash = deviceHash;
      student.lastKnownIp = currentIp;
      await student.save();
    }

    await logAuditEvent({
      req, action: 'attendance.marked',
      targetType: 'attendance', targetId: attendance.id,
      campus: course?.campus || null, faculty: course?.faculty || null, department: course?.department || null,
      metadata: { sessionId: session.id, courseId: session.courseId, status: 'present', distanceFromClass: distanceMetersValue, attemptNumber, deviceFlagged },
    });

    res.status(201).json({ success: true, message: 'Attendance has been recorded successfully.', data: attendance });
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
        { model: Session, as: 'session', attributes: ['id', 'sessionCode', 'date', 'startTime', 'endTime'] },
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
