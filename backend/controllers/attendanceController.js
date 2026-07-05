const { Op, UniqueConstraintError } = require('sequelize');
const { AbsenceQuery, Session, Attendance, Course, User, Enrollment, AttendanceAttempt } = require('../models');
const { haversineDistance, validateGpsAccuracy, validateLocationTimestamp, isMockedLocation, isInsideNigeriaBounds } = require('../utils/geoValidation');
const crypto = require('crypto');
const { sendEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');
const { broadcastNotification, buildNotificationPayload } = require('../utils/realtimeNotifications');
const env = require('../utils/env');

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

const buildDeviceFingerprint = (req) => crypto
  .createHash('sha256')
  .update(req.get('user-agent') || 'unknown-device')
  .digest('hex')
  .slice(0, 32);

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
    const { sessionKey, courseCode, method, latitude, longitude, accuracy, locationTimestamp } = req.body;
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

    if (courseCode) {
      const normalizedCourseCode = String(courseCode).trim().toUpperCase();
      const sessionCourseCode = String(course.courseCode || '').trim().toUpperCase();
      if (normalizedCourseCode !== sessionCourseCode) {
        return res.status(403).json({ success: false, message: 'The course code does not match this attendance session.' });
      }
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

    if (parsedAccuracy !== null) {
      const maxAccuracy = env.attendanceMaxLocationAccuracy;
      if (parsedAccuracy > maxAccuracy) {
        return res.status(403).json({ success: false, message: `Your location signal is not accurate enough (${Math.round(parsedAccuracy)}m). Move to an open area and try again.` });
      }
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
      metadata: { distanceMeters: distanceMetersValue },
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
