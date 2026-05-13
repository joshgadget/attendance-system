/**
 * OOU Attendance Controller
 * University-scale rewrite of the attendance marking and session management logic
 * for Olabisi Onabanjo University, Ago-Iwoye.
 */

const { Op } = require('sequelize');
const crypto = require('crypto');
const { AbsenceQuery, Session, Attendance, Course, User, Building, Enrollment } = require('../models');
const { sendEmail } = require('../utils/mailer');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');

// ── Helpers ────────────────────────────────────────────────────────────────

const generateSessionCode = () => crypto.randomBytes(5).toString('hex').toUpperCase();

const buildEndTime = (startTime, durationMinutes) => {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + Number(durationMinutes);
  return `${String(Math.floor((total / 60) % 24)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
};

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

// ── Create Session ──────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  try {
    const {
      courseId, date, startTime, durationMinutes,
      venue, maxAttendanceTime, buildingId,
    } = req.body;

    if (!courseId || !date || !startTime) {
      return res.status(400).json({ success: false, message: 'courseId, date, and startTime are required.' });
    }

    // OOU policy: a building MUST be selected — no session without geofence
    if (!buildingId) {
      return res.status(400).json({
        success: false,
        message: 'A geofenced OOU building is required. Select the building where the class is held.',
      });
    }

    const building = await Building.findOne({ where: { id: buildingId, isActive: true } });
    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found or inactive.' });
    }

    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    if (req.user.role === 'lecturer' && course.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this course.' });
    }

    // Generate a guaranteed-unique session code
    let sessionCode;
    let attempts = 0;
    do {
      sessionCode = generateSessionCode();
      attempts++;
      if (attempts > 20) throw new Error('Could not generate unique session code. Try again.');
    } while (await Session.findOne({ where: { sessionCode } }));

    const duration = Number(durationMinutes || 60);
    const resolvedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;

    const session = await Session.create({
      courseId,
      lecturerId: course.lecturerId,
      date,
      startTime: resolvedStartTime,
      endTime: buildEndTime(resolvedStartTime, duration),
      sessionCode,
      venue: venue || building.name,
      status: 'active',
      maxAttendanceTime: Number(maxAttendanceTime || 15),
      // Geofence inherited directly from building — lecturer cannot manually override
      geofenceLatitude: Number(building.latitude),
      geofenceLongitude: Number(building.longitude),
      geofenceRadiusMeters: Number(building.radiusMeters),
    });

    // Real-time notification via Socket.IO
    const io = req.app.get('io');
    if (io) io.emit('session_created', { sessionId: session.id, courseId, date });

    return res.status(201).json({
      success: true,
      message: 'Session created successfully.',
      data: { session, sessionCode, building: building.name },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Mark Attendance (called AFTER the oouAttendancePipeline middleware) ─────
exports.markAttendance = async (req, res) => {
  try {
    const session = req.attendanceSession; // Set by validateSession middleware
    const location = req.verifiedLocation; // Set by enforceGeofence middleware

    // Determine status: present or late
    const sessionStart = new Date(`${session.date}T${session.startTime}`);
    const diffMinutes = Math.floor((Date.now() - sessionStart) / 60000);
    const status = diffMinutes > session.maxAttendanceTime ? 'late' : 'present';

    const attendance = await Attendance.create({
      sessionId: session.id,
      studentId: req.user.id,
      courseId: session.courseId,
      status,
      markedAt: new Date(),
      markedBy: 'self',
      verificationMethod: 'qr',
      deviceInfo: req.deviceMeta?.userAgent || req.get('user-agent') || null,
      deviceFlagged: req.deviceFlagged || false,
      location: location
        ? `${location.latitude},${location.longitude}`
        : req.ip,
      locationAccuracy: location?.accuracy || null,
      distanceFromClass: location?.distanceMeters || null,
    });

    // Push real-time update to lecturer's dashboard
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${session.id}`).emit('attendance_update', {
        sessionId: session.id,
        studentId: req.user.id,
        studentName: `${req.user.firstName} ${req.user.lastName}`,
        matricNumber: req.user.matricNumber,
        status,
        markedAt: attendance.markedAt,
        distanceFromClass: location?.distanceMeters,
        deviceFlagged: req.deviceFlagged || false,
      });
    }

    return res.status(201).json({
      success: true,
      message: `Attendance marked as ${status}.`,
      data: attendance,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Sessions ────────────────────────────────────────────────────────────
exports.getSessions = async (req, res) => {
  try {
    const where = {};
    if (req.user.role === 'lecturer') where.lecturerId = req.user.id;

    const sessions = await Session.findAll({
      where,
      include: [{ model: Course, as: 'course', attributes: ['id', 'courseCode', 'courseName', 'department', 'faculty', 'level'] }],
      order: [['date', 'DESC'], ['startTime', 'DESC']],
    });

    return res.json({ success: true, data: sessions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Single Session with Full Stats ─────────────────────────────────────
exports.getSession = async (req, res) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [
        { model: Course, as: 'course' },
        {
          model: Attendance, as: 'attendances',
          include: [{
            model: User, as: 'student',
            attributes: ['id', 'firstName', 'lastName', 'matricNumber', 'email', 'department', 'faculty', 'level'],
          }],
        },
        {
          model: AbsenceQuery, as: 'queries',
          include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'matricNumber', 'email'] }],
        },
      ],
    });

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    if (req.user.role === 'lecturer' && session.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorised to view this session.' });
    }

    const enrollments = await findEnrollmentsForCourse(session.course, { includeStudent: true });
    const presentIds = new Set(session.attendances.map((a) => a.studentId));
    const absentStudents = enrollments.filter((e) => !presentIds.has(e.userId)).map((e) => e.student);

    // Flag suspicious entries for the lecturer's view
    const flaggedAttendances = session.attendances.filter((a) => a.deviceFlagged);

    return res.json({
      success: true,
      data: {
        ...session.toJSON(),
        attendanceStats: {
          expectedCount: enrollments.length,
          presentCount: session.attendances.filter((a) => a.status === 'present').length,
          lateCount: session.attendances.filter((a) => a.status === 'late').length,
          absentCount: absentStudents.length,
          flaggedCount: flaggedAttendances.length,
          queryCount: session.queries.length,
        },
        enrolledStudents: enrollments.map((e) => e.student),
        absentStudents,
        flaggedAttendances,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Close Session + Auto Absence Queries ────────────────────────────────────
exports.closeSession = async (req, res) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [{ model: Course, as: 'course' }],
    });

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    if (req.user.role === 'lecturer' && session.course?.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }

    session.status = 'closed';
    await session.save();

    const enrollments = await findEnrollmentsForCourse(session.course, { includeStudent: true });
    const attendances = await Attendance.findAll({ where: { sessionId: session.id }, attributes: ['studentId'] });
    const presentIds = new Set(attendances.map((a) => a.studentId));
    const absentEnrollments = enrollments.filter((e) => !presentIds.has(e.userId));

    let queriesCreated = 0;
    const lecturerName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || 'Your Lecturer';

    for (const enrollment of absentEnrollments) {
      const existing = await AbsenceQuery.findOne({
        where: { sessionId: session.id, studentId: enrollment.userId },
      });

      if (!existing) {
        const query = await AbsenceQuery.create({
          lecturerId: session.lecturerId,
          studentId: enrollment.userId,
          sessionId: session.id,
          title: `Absence Query: ${session.course?.courseCode || 'Class'} on ${session.date}`,
          message: `Dear Student,\n\nYou were not recorded as present for ${session.course?.courseName || 'class'} (${session.course?.courseCode || ''}) held on ${session.date} at ${session.startTime}.\n\nAttendance is compulsory under OOU policy. The minimum required is ${session.course?.minAttendancePercent || 75}%. Please provide a written explanation for your absence within 48 hours.\n\n${lecturerName}`,
          status: 'pending',
        });
        queriesCreated++;

        if (enrollment.student?.email) {
          sendEmail({
            to: enrollment.student.email,
            subject: `OOU Attendance Query: ${session.course?.courseCode} on ${session.date}`,
            text: query.message,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
                <div style="background:#1a237e;color:white;padding:16px;border-radius:4px;margin-bottom:20px;">
                  <h2 style="margin:0;">Olabisi Onabanjo University</h2>
                  <p style="margin:4px 0 0;opacity:0.8;">Attendance Management System</p>
                </div>
                <h3>Absence Query</h3>
                <p><strong>Course:</strong> ${session.course?.courseName} (${session.course?.courseCode})</p>
                <p><strong>Date:</strong> ${session.date}</p>
                <p><strong>Time:</strong> ${session.startTime}</p>
                <p><strong>Venue:</strong> ${session.venue || 'N/A'}</p>
                <hr style="border:none;border-top:1px solid #eee;"/>
                <p>${query.message.replace(/\n/g, '<br/>')}</p>
                <p style="color:#666;font-size:12px;margin-top:30px;">
                  This message was generated automatically by the OOU Attendance Management System.
                  Log in to your student portal to submit your response.
                </p>
              </div>
            `,
          }).catch((err) => console.warn(`Email failed for student ${enrollment.userId}:`, err.message));
        }
      }
    }

    const io = req.app.get('io');
    if (io) io.to(`session_${session.id}`).emit('session_closed', { sessionId: session.id });

    return res.json({
      success: true,
      message: 'Session closed. Absence queries sent automatically.',
      data: { absentCount: absentEnrollments.length, queriesCreated },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Student Attendance History with OOU compliance report ──────────────────
exports.getStudentHistory = async (req, res) => {
  try {
    const attendances = await Attendance.findAll({
      where: { studentId: req.user.id },
      include: [{ model: Session, as: 'session', include: [{ model: Course, as: 'course' }] }],
      order: [['markedAt', 'DESC']],
    });

    // Compute per-course attendance percentage against OOU 75% minimum
    const courseMap = {};
    for (const record of attendances) {
      const courseId = record.session?.courseId;
      if (!courseId) continue;
      if (!courseMap[courseId]) {
        courseMap[courseId] = { course: record.session?.course, present: 0, late: 0, total: 0 };
      }
      courseMap[courseId].total++;
      if (record.status === 'present') courseMap[courseId].present++;
      if (record.status === 'late') courseMap[courseId].late++;
    }

    const complianceSummary = Object.values(courseMap).map((entry) => {
      const percent = entry.total > 0
        ? Math.round(((entry.present + entry.late) / entry.total) * 100)
        : 0;
      const required = entry.course?.minAttendancePercent || 75;
      return {
        courseCode: entry.course?.courseCode,
        courseName: entry.course?.courseName,
        present: entry.present,
        late: entry.late,
        total: entry.total,
        attendancePercent: percent,
        requiredPercent: required,
        compliant: percent >= required,
      };
    });

    return res.json({
      success: true,
      data: { attendances, complianceSummary },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
