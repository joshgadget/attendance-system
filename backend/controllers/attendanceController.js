const { AbsenceQuery, Session, Attendance, Course, User } = require('../models');
const crypto = require('crypto');
const { sendEmail } = require('../utils/mailer');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');

const generateSessionCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();

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
    } = req.body;
    const resolvedCourseId = courseId || course_id;
    const resolvedStartTime = startTime || start_time;
    const resolvedDuration = Number(durationMinutes || duration_minutes || 120);
    const hasAnyGeofenceInput =
      (geofenceLatitude !== undefined && geofenceLatitude !== '') ||
      (geofenceLongitude !== undefined && geofenceLongitude !== '') ||
      (geofenceRadiusMeters !== undefined && geofenceRadiusMeters !== '');

    if (!resolvedCourseId || !date || !resolvedStartTime) {
      return res.status(400).json({
        success: false,
        message: 'courseId, date and startTime are required'
      });
    }

    if (hasAnyGeofenceInput) {
      if (
        geofenceLatitude === undefined ||
        geofenceLatitude === '' ||
        geofenceLongitude === undefined ||
        geofenceLongitude === '' ||
        geofenceRadiusMeters === undefined ||
        geofenceRadiusMeters === ''
      ) {
        return res.status(400).json({
          success: false,
          message: 'geofenceLatitude, geofenceLongitude and geofenceRadiusMeters must be provided together',
        });
      }

      const parsedRadius = Number(geofenceRadiusMeters);
      if (Number.isNaN(parsedRadius) || parsedRadius < 5 || parsedRadius > 5000) {
        return res.status(400).json({
          success: false,
          message: 'geofenceRadiusMeters must be between 5 and 5000',
        });
      }
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
      venue: venue || null,
      status: 'active',
      maxAttendanceTime: Number(maxAttendanceTime || 15),
      geofenceLatitude: hasAnyGeofenceInput ? Number(geofenceLatitude) : null,
      geofenceLongitude: hasAnyGeofenceInput ? Number(geofenceLongitude) : null,
      geofenceRadiusMeters: hasAnyGeofenceInput ? Number(geofenceRadiusMeters) : null,
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
    const where = req.user.role === 'lecturer' ? { lecturerId: req.user.id } : {};
    const sessions = await Session.findAll({
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
    const session = await Session.findByPk(req.params.id, {
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

    const payload = {
      ...session.toJSON(),
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
    const { sessionCode, session_code, latitude, longitude } = req.body;
    const resolvedSessionCode = sessionCode || session_code;
    const session = await Session.findOne({ where: { sessionCode: resolvedSessionCode, status: 'active' } });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Invalid or expired session code' });
    }

    const existing = await Attendance.findOne({ where: { sessionId: session.id, studentId: req.user.id } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already marked attendance' });
    }

    const sessionStart = new Date(`${session.date}T${session.startTime}`);
    const now = new Date();
    const diffMinutes = Math.floor((now - sessionStart) / (1000 * 60));
    const status = diffMinutes > session.maxAttendanceTime ? 'late' : 'present';

    if (hasGeofence(session)) {
      if (latitude === undefined || longitude === undefined) {
        return res.status(403).json({
          success: false,
          message: 'This class requires location verification. Enable location and try again.',
        });
      }

      const parsedLatitude = Number(latitude);
      const parsedLongitude = Number(longitude);
      if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
        return res.status(400).json({ success: false, message: 'Invalid location coordinates supplied' });
      }

      const meters = distanceMeters(
        parsedLatitude,
        parsedLongitude,
        Number(session.geofenceLatitude),
        Number(session.geofenceLongitude)
      );

      if (meters > Number(session.geofenceRadiusMeters)) {
        return res.status(403).json({
          success: false,
          message: `Outside allowed attendance zone. Distance is ${Math.round(meters)}m, max allowed is ${session.geofenceRadiusMeters}m.`,
        });
      }
    }

    const attendance = await Attendance.create({
      sessionId: session.id,
      studentId: req.user.id,
      courseId: session.courseId,
      status,
      markedAt: new Date(),
      markedBy: 'self',
      verificationMethod: 'qr',
      deviceInfo: req.get('user-agent') || null,
      location: latitude && longitude ? `${latitude},${longitude}` : req.ip
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
