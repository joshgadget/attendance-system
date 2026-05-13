const jwt = require('jsonwebtoken');
const { Op, UniqueConstraintError } = require('sequelize');
const { AbsenceQuery, Session, Attendance, Course, User, Building, Enrollment } = require('../models');
const crypto = require('crypto');
const authConfig = require('../config/auth');
const { sendEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');

const generateSessionCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();
const SESSION_SUMMARY_ATTRIBUTES = ['id', 'courseId', 'lecturerId', 'sessionCode', 'date', 'startTime', 'endTime', 'venue', 'status', 'maxAttendanceTime', 'createdAt', 'updatedAt'];
const ATTENDANCE_PASS_TTL_SECONDS = 120;

const buildEndTime = (startTime, durationMinutes) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = String(Math.floor((totalMinutes / 60) % 24)).padStart(2, '0');
  const endMinutes = String(totalMinutes % 60).padStart(2, '0');
  return `${endHours}:${endMinutes}:00`;
};

const hasGeofence = (session) =>
  session.geofenceLatitude !== null &&
  session.geofenceLongitude !== null &&
  session.geofenceRadiusMeters !== null;

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

const isInsideNigeriaBounds = (latitude, longitude) =>
  latitude >= 4.0 &&
  latitude <= 14.0 &&
  longitude >= 2.5 &&
  longitude <= 15.0;

const buildDeviceFingerprint = (req) => crypto
  .createHash('sha256')
  .update(req.get('user-agent') || 'unknown-device')
  .digest('hex')
  .slice(0, 32);

const buildAttendancePassPayload = (session) => ({
  type: 'attendance-pass',
  sessionId: session.id,
  sessionCode: session.sessionCode,
  lecturerId: session.lecturerId,
});

const signAttendancePass = (session) => {
  const token = jwt.sign(buildAttendancePassPayload(session), authConfig.jwt.secret, {
    expiresIn: ATTENDANCE_PASS_TTL_SECONDS,
  });
  const decoded = jwt.decode(token);
  return {
    token,
    expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
  };
};

const verifyAttendancePass = (token, session) => {
  if (!token) {
    const error = new Error('Attendance key is required. Scan the lecturer QR code again and try once more.');
    error.statusCode = 403;
    throw error;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, authConfig.jwt.secret);
  } catch (error) {
    const authError = new Error('Attendance key expired or invalid. Scan the lecturer QR code again.');
    authError.statusCode = 403;
    throw authError;
  }

  if (
    decoded?.type !== 'attendance-pass' ||
    Number(decoded?.sessionId) !== Number(session.id) ||
    String(decoded?.sessionCode || '').trim().toUpperCase() !== String(session.sessionCode || '').trim().toUpperCase()
  ) {
    const mismatchError = new Error('Attendance key does not match this session. Scan the active QR code in class again.');
    mismatchError.statusCode = 403;
    throw mismatchError;
  }

  return decoded;
};

exports.createSession = async (req, res) => {
  try {
    const {
      courseId,
      course_id,
      date,
      startTime,
      start_time,
      durationMinutes,
      duration_minutes,
      venue,
      maxAttendanceTime,
      geofenceLatitude,
      geofenceLongitude,
      geofenceRadiusMeters,
      buildingId,
      building_id,
    } = req.body;
    const resolvedCourseId = courseId || course_id;
    const resolvedStartTime = startTime || start_time;
    const resolvedDuration = Number(durationMinutes || duration_minutes || 120);

    if (!resolvedCourseId || !date || !resolvedStartTime) {
      return res.status(400).json({
        success: false,
        message: 'courseId, date and startTime are required'
      });
    }

    const resolvedBuildingId = buildingId || building_id;

    if (!resolvedBuildingId) {
      return res.status(400).json({
        success: false,
        message: 'buildingId is required. Select a geofenced building.',
      });
    }

    const building = await Building.findOne({ where: { id: resolvedBuildingId, isActive: true } });
    if (!building) {
      return res.status(404).json({ success: false, message: 'Selected building geofence was not found or is inactive.' });
    }

    const course = await Course.findByPk(resolvedCourseId);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'lecturer' && course.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let sessionCode;
    let isUnique = false;
    while (!isUnique) {
      sessionCode = generateSessionCode();
      const existing = await Session.findOne({ where: { sessionCode } });
      if (!existing) {
        isUnique = true;
      }
    }

    const session = await Session.create({
      courseId: resolvedCourseId,
      lecturerId: course.lecturerId,
      date,
      startTime: resolvedStartTime.length === 5 ? `${resolvedStartTime}:00` : resolvedStartTime,
      endTime: buildEndTime(resolvedStartTime, resolvedDuration),
      sessionCode,
      venue: venue || building.name,
      status: 'active',
      maxAttendanceTime: Number(maxAttendanceTime || 15),
      geofenceLatitude: Number(building.latitude),
      geofenceLongitude: Number(building.longitude),
      geofenceRadiusMeters: Number(building.radiusMeters),
    });

    await logAuditEvent({
      req,
      action: 'attendance.session.created',
      targetType: 'session',
      targetId: session.id,
      campus: building.campus || course.campus || null,
      faculty: course.faculty || null,
      department: course.department || null,
      metadata: {
        courseId: course.id,
        courseCode: course.courseCode,
        buildingId: building.id,
        buildingName: building.name,
        date,
        startTime: session.startTime,
        endTime: session.endTime,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Session created',
      data: { session, sessionCode }
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
    const attendancePassBundle = session.status === 'active' ? signAttendancePass(session) : null;

    const payload = {
      ...session.toJSON(),
      attendancePass: attendancePassBundle?.token || null,
      attendancePassExpiresAt: attendancePassBundle?.expiresAt || null,
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
    const { sessionCode, session_code, attendancePass, attendance_pass, latitude, longitude, accuracy } = req.body;
    const resolvedSessionCode = sessionCode || session_code;
    if (!resolvedSessionCode) {
      return res.status(400).json({ success: false, message: 'sessionCode is required' });
    }

    const session = await Session.findOne({ where: { sessionCode: resolvedSessionCode, status: 'active' } });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Invalid or expired session code' });
    }

    try {
      verifyAttendancePass(attendancePass || attendance_pass, session);
    } catch (verificationError) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.rejected.invalid_pass',
        targetType: 'session',
        targetId: session.id,
        metadata: { sessionCode: resolvedSessionCode },
      });
      return res.status(verificationError.statusCode || 403).json({ success: false, message: verificationError.message });
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
        message: 'Attendance already recorded for this session.',
        data: existing,
      });
    }

    const course = await Course.findByPk(session.courseId, { attributes: ['id', 'semester', 'academicYear'] });
    const enrollment = await Enrollment.findOne({
      where: {
        userId: req.user.id,
        courseId: session.courseId,
        status: 'active',
        [Op.or]: [
          {
            semester: course?.semester || null,
            academicYear: course?.academicYear || null,
          },
          {
            courseId: session.courseId,
            userId: req.user.id,
            status: 'active',
          },
        ],
      },
    });

    if (!enrollment) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.rejected.not_enrolled',
        targetType: 'session',
        targetId: session.id,
        metadata: { courseId: session.courseId },
      });
      return res.status(403).json({
        success: false,
        message: 'You are not registered for this course, so attendance cannot be marked.',
      });
    }

    const sessionStart = new Date(`${session.date}T${session.startTime}`);
    const sessionEnd = new Date(`${session.date}T${session.endTime}`);
    const now = new Date();
    const earliestMarkTime = new Date(sessionStart.getTime() - (5 * 60 * 1000));
    const closingDeadline = new Date(sessionEnd.getTime() + (15 * 60 * 1000));

    if (now < earliestMarkTime) {
      return res.status(403).json({
        success: false,
        message: `This session has not opened yet. Attendance opens shortly before ${session.startTime}.`,
      });
    }

    if (now > closingDeadline) {
      return res.status(403).json({
        success: false,
        message: 'The attendance window for this session has closed.',
      });
    }

    const diffMinutes = Math.floor((now - sessionStart) / (1000 * 60));
    const status = diffMinutes > session.maxAttendanceTime ? 'late' : 'present';

    if (!hasGeofence(session)) {
      return res.status(403).json({
        success: false,
        message: 'This session has no verified building geofence. Contact your lecturer to re-create the session properly.',
      });
    }

    if (latitude === undefined || longitude === undefined) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.rejected.location_missing',
        targetType: 'session',
        targetId: session.id,
        metadata: { courseId: session.courseId },
      });
      return res.status(403).json({
        success: false,
        message: 'This class requires location verification. Enable location and try again.',
      });
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedAccuracy = accuracy === undefined || accuracy === null || accuracy === ''
      ? null
      : Number(accuracy);

    if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
      return res.status(400).json({ success: false, message: 'Invalid location coordinates supplied' });
    }

    if (!isInsideNigeriaBounds(parsedLatitude, parsedLongitude)) {
      return res.status(403).json({
        success: false,
        message: 'Your GPS coordinates appear to be outside Nigeria. Attendance cannot be marked.',
      });
    }

    if (parsedAccuracy !== null && (Number.isNaN(parsedAccuracy) || parsedAccuracy <= 0 || parsedAccuracy > 100)) {
      return res.status(403).json({
        success: false,
        message: `Your GPS accuracy is too low${Number.isNaN(parsedAccuracy) ? '' : ` (${Math.round(parsedAccuracy)}m)`}. Move to an open area and try again.`,
      });
    }

    const meters = distanceMeters(
      parsedLatitude,
      parsedLongitude,
      Number(session.geofenceLatitude),
      Number(session.geofenceLongitude)
    );

    if (meters > Number(session.geofenceRadiusMeters)) {
      await logAuditEvent({
        req,
        action: 'attendance.mark.rejected.outside_geofence',
        targetType: 'session',
        targetId: session.id,
        metadata: {
          courseId: session.courseId,
          distanceMeters: Math.round(meters),
          allowedRadiusMeters: Number(session.geofenceRadiusMeters),
          locationAccuracy: parsedAccuracy,
        },
      });
      return res.status(403).json({
        success: false,
        message: `Outside allowed attendance zone. Distance is ${Math.round(meters)}m, max allowed is ${session.geofenceRadiusMeters}m.`,
      });
    }

    const student = await User.findByPk(req.user.id, {
      attributes: ['id', 'lastKnownDeviceHash', 'lastKnownIp'],
    });
    const deviceHash = buildDeviceFingerprint(req);
    const currentIp = req.ip || req.get('x-forwarded-for') || req.connection?.remoteAddress || null;
    const deviceFlagged = Boolean(
      student &&
      student.lastKnownDeviceHash &&
      student.lastKnownIp &&
      student.lastKnownDeviceHash !== deviceHash &&
      student.lastKnownIp !== currentIp
    );

    let attendance;
    try {
      attendance = await Attendance.create({
        sessionId: session.id,
        studentId: req.user.id,
        courseId: session.courseId,
        status,
        markedAt: new Date(),
        markedBy: 'self',
        verificationMethod: 'qr',
        deviceInfo: req.get('user-agent') || null,
        location: `${parsedLatitude},${parsedLongitude}`,
        locationAccuracy: parsedAccuracy,
        distanceFromClass: Math.round(meters),
        deviceFlagged,
      });
    } catch (createError) {
      if (createError instanceof UniqueConstraintError) {
        const recordedAttendance = await Attendance.findOne({ where: { sessionId: session.id, studentId: req.user.id } });
        return res.status(200).json({
          success: true,
          message: 'Attendance already recorded for this session.',
          data: recordedAttendance,
        });
      }

      throw createError;
    }

    const duplicateAttendances = await Attendance.findAll({
      where: { sessionId: session.id, studentId: req.user.id },
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
    });

    if (duplicateAttendances.length > 1) {
      const primaryAttendance = duplicateAttendances[0];
      const duplicateIds = duplicateAttendances.slice(1).map((entry) => entry.id);

      if (duplicateIds.length) {
        await Attendance.destroy({ where: { id: duplicateIds } });
      }

      return res.status(200).json({
        success: true,
        message: 'Attendance already recorded for this session.',
        data: primaryAttendance,
      });
    }

    if (student) {
      student.lastKnownDeviceHash = deviceHash;
      student.lastKnownIp = currentIp;
      await student.save();
    }

    await logAuditEvent({
      req,
      action: 'attendance.marked',
      targetType: 'attendance',
      targetId: attendance.id,
      campus: course?.campus || null,
      faculty: course?.faculty || null,
      department: course?.department || null,
      metadata: {
        sessionId: session.id,
        courseId: session.courseId,
        status,
        verificationMethod: 'qr+pass+geofence',
        locationAccuracy: parsedAccuracy,
        distanceFromClass: Math.round(meters),
        deviceFlagged,
      },
    });

    res.status(201).json({ success: true, message: `Attendance marked as ${status}`, data: attendance });
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
