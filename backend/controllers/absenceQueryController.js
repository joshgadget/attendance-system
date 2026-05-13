const { Op } = require('sequelize');
const { AbsenceQuery, User, Session, Course, Enrollment } = require('../models');
const { sendEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');

const getLecturerStudentIds = async (lecturerId) => {
  const courses = await Course.findAll({
    where: { lecturerId, isActive: true },
    attributes: ['id'],
  });

  const courseIds = courses.map((course) => course.id);
  if (courseIds.length === 0) {
    return [];
  }

  const enrollments = await Enrollment.findAll({
    where: {
      courseId: { [Op.in]: courseIds },
      status: 'active',
    },
    attributes: ['userId'],
  });

  return [...new Set(enrollments.map((entry) => entry.userId).filter(Boolean))];
};

exports.createQuery = async (req, res) => {
  try {
    const { studentId, sessionId, title, message } = req.body;

    if (!studentId || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'studentId, title and message are required'
      });
    }

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (sessionId) {
      const session = await Session.findByPk(sessionId, {
        include: [{ model: Course, as: 'course' }]
      });

      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      if (req.user.role === 'lecturer' && session.course?.lecturerId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Not authorized to query this session' });
      }

      const enrollments = await findEnrollmentsForCourse(session.course);
      const isEnrolled = enrollments.some((entry) => entry.userId === student.id);
      if (!isEnrolled) {
        return res.status(400).json({
          success: false,
          message: 'Selected student is not enrolled for the linked session course',
        });
      }
    }

    if (!sessionId && req.user.role === 'lecturer') {
      const lecturerStudentIds = await getLecturerStudentIds(req.user.id);
      if (!lecturerStudentIds.includes(student.id)) {
        return res.status(403).json({
          success: false,
          message: 'You can only send queries to students enrolled in your assigned courses.',
        });
      }
    }

    const query = await AbsenceQuery.create({
      lecturerId: req.user.id,
      studentId,
      sessionId: sessionId || null,
      title,
      message
    });

    await logAuditEvent({
      req,
      action: 'absence_query.created',
      targetType: 'absence_query',
      targetId: query.id,
      campus: student.campus || null,
      faculty: student.faculty || null,
      department: student.department || null,
      metadata: {
        sessionId: query.sessionId,
        studentId: student.id,
      },
    });

    try {
      if (student.email) {
        const lecturerName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || 'Your lecturer';
        const sessionLabel = sessionId ? ` for ${query.sessionId}` : '';
        await sendEmail({
          to: student.email,
          subject: `Attendance System: New absence query${sessionLabel}`,
          text: `${lecturerName} sent you an absence query.\n\nTitle: ${title}\n\nMessage: ${message}`,
          html: `<p>${lecturerName} sent you an absence query.</p><p><strong>Title:</strong> ${title}</p><p>${message}</p>`,
        });
      }
    } catch (emailError) {
      console.warn('Absence query email failed:', emailError.message);
    }

    res.status(201).json({ success: true, message: 'Absence query sent', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQueries = async (req, res) => {
  try {
    const where = req.user.role === 'student'
      ? { studentId: req.user.id }
      : { lecturerId: req.user.id };

    const queries = await AbsenceQuery.findAll({
      where,
      include: [
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'email', 'matricNumber'] },
        { model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email'] },
        {
          model: Session,
          as: 'session',
          attributes: ['id', 'date', 'startTime', 'sessionCode', 'status'],
          include: [{ model: Course, as: 'course', attributes: ['id', 'courseCode', 'courseName'] }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: queries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.respondToQuery = async (req, res) => {
  try {
    const { response } = req.body;
    const query = await AbsenceQuery.findByPk(req.params.id);

    if (!query) {
      return res.status(404).json({ success: false, message: 'Query not found' });
    }

    if (req.user.role === 'student' && query.studentId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role !== 'student' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only students can respond' });
    }

    if (!response) {
      return res.status(400).json({ success: false, message: 'Response is required' });
    }

    query.studentResponse = response;
    query.status = 'responded';
    query.respondedAt = new Date();
    await query.save();

    await logAuditEvent({
      req,
      action: 'absence_query.responded',
      targetType: 'absence_query',
      targetId: query.id,
      metadata: { sessionId: query.sessionId, studentId: query.studentId },
    });

    try {
      const lecturer = await User.findByPk(query.lecturerId);
      if (lecturer?.email) {
        const student = await User.findByPk(query.studentId);
        const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'A student';
        await sendEmail({
          to: lecturer.email,
          subject: 'Attendance System: Student responded to absence query',
          text: `${studentName} responded to the absence query.\n\nTitle: ${query.title}\n\nResponse: ${response}`,
          html: `<p>${studentName} responded to the absence query.</p><p><strong>Title:</strong> ${query.title}</p><p><strong>Response:</strong> ${response}</p>`,
        });
      }
    } catch (emailError) {
      console.warn('Absence response email failed:', emailError.message);
    }

    res.json({ success: true, message: 'Response submitted', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.closeQuery = async (req, res) => {
  try {
    const query = await AbsenceQuery.findByPk(req.params.id);

    if (!query) {
      return res.status(404).json({ success: false, message: 'Query not found' });
    }

    if (req.user.role === 'lecturer' && query.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    query.status = 'closed';
    await query.save();

    await logAuditEvent({
      req,
      action: 'absence_query.closed',
      targetType: 'absence_query',
      targetId: query.id,
      metadata: { sessionId: query.sessionId, studentId: query.studentId },
    });

    res.json({ success: true, message: 'Query closed', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
