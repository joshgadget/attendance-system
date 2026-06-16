const { Op } = require('sequelize');
const { AbsenceQuery, User, Session, Course, Enrollment } = require('../models');
const { sendEmail } = require('../utils/mailer');
const { logAuditEvent } = require('../utils/auditLogger');
const { findEnrollmentsForCourse } = require('../utils/enrollmentLookup');
const { broadcastNotification, buildNotificationPayload } = require('../utils/realtimeNotifications');
const { canEscalateAbsenceQuery } = require('../utils/absenceQueryPolicy');

const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const sanitizeText = (value) => String(value || '').trim();

const estimateDataUrlBytes = (dataUrl = '') => {
  const compact = String(dataUrl || '').trim();
  if (!compact) {
    return 0;
  }

  const base64Payload = compact.includes(',') ? compact.split(',')[1] : compact;
  return Buffer.byteLength(base64Payload, 'base64');
};

const normalizeEvidencePayload = (payload = {}, prefix = 'query') => {
  const source = payload[`${prefix}Evidence`] || payload.evidence || {};
  const fileName = sanitizeText(source.fileName || source.name || payload[`${prefix}EvidenceFileName`] || payload.evidenceFileName);
  const mimeType = sanitizeText(source.mimeType || source.type || payload[`${prefix}EvidenceMimeType`] || payload.evidenceMimeType).toLowerCase();
  const data = sanitizeText(source.data || source.dataUrl || source.content || payload[`${prefix}EvidenceData`] || payload.evidenceData);
  const note = sanitizeText(source.note || source.caption || payload[`${prefix}EvidenceNote`] || payload.evidenceNote);

  if (!data) {
    return null;
  }

  if (!mimeType) {
    const error = new Error('Evidence file type is required when an attachment is uploaded.');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(mimeType)) {
    const error = new Error('Evidence must be a PDF or an image file.');
    error.statusCode = 400;
    throw error;
  }

  if (estimateDataUrlBytes(data) > MAX_EVIDENCE_BYTES) {
    const error = new Error('Evidence file is too large. Please keep it under 3MB.');
    error.statusCode = 400;
    throw error;
  }

  return {
    fileName: fileName || `${prefix}-evidence.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`,
    mimeType,
    data,
    note: note || null,
  };
};

const buildQueryNotification = ({ query, title, description, tone, linkTab = 'queries' }) =>
  buildNotificationPayload({
    type: 'absence_query',
    title,
    description,
    tone,
    linkTab,
    entityType: 'absence_query',
    entityId: query.id,
    meta: {
      queryId: query.id,
      sessionId: query.sessionId,
      studentId: query.studentId,
      lecturerId: query.lecturerId,
      escalationState: query.escalationState,
      hasQueryEvidence: Boolean(query.queryEvidenceData),
      hasResponseEvidence: Boolean(query.responseEvidenceData),
    },
  });

const emitQueryNotifications = (req, { query, userIds = [], roles = [], notification }) => {
  const io = req.app.get('io');
  broadcastNotification(io, {
    userIds,
    roles,
    notification: notification || buildQueryNotification({
      query,
      title: 'Absence query update',
      description: query.title,
      tone: 'blue',
    }),
  });
};

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
    const queryEvidence = normalizeEvidencePayload(req.body, 'query');
    const explicitLecturerId = req.body.lecturerId ? Number(req.body.lecturerId) : null;
    let session = null;

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
      session = await Session.findByPk(sessionId, {
        include: [{ model: Course, as: 'course' }]
      });

      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      if (req.user.role === 'lecturer' && session.course?.lecturerId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Not authorized to query this session' });
      }

      if (req.user.role === 'admin' && explicitLecturerId && session.course?.lecturerId && Number(explicitLecturerId) !== Number(session.course.lecturerId)) {
        return res.status(403).json({
          success: false,
          message: 'Admin queries linked to a session must match the session lecturer.',
        });
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

    const resolvedLecturerId = req.user.role === 'admin'
      ? (explicitLecturerId || session?.course?.lecturerId || req.user.id)
      : req.user.id;

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
      lecturerId: resolvedLecturerId,
      studentId,
      sessionId: sessionId || null,
      title,
      message,
      queryEvidenceFileName: queryEvidence?.fileName || null,
      queryEvidenceMimeType: queryEvidence?.mimeType || null,
      queryEvidenceData: queryEvidence?.data || null,
      queryEvidenceNote: queryEvidence?.note || null,
      escalationState: 'none',
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

    const lecturerSource = resolvedLecturerId === req.user.id
      ? req.user
      : await User.findByPk(resolvedLecturerId, { attributes: ['firstName', 'lastName', 'email'] });
    const lecturerDisplayName = [lecturerSource?.firstName, lecturerSource?.lastName].filter(Boolean).join(' ') || 'Your lecturer';

    try {
      if (student.email) {
        const sessionLabel = sessionId ? ` for ${query.sessionId}` : '';
        await sendEmail({
          to: student.email,
          subject: `Attendance System: New absence query${sessionLabel}`,
          text: `${lecturerDisplayName} sent you an absence query.\n\nTitle: ${title}\n\nMessage: ${message}${queryEvidence?.fileName ? `\n\nEvidence attached: ${queryEvidence.fileName}` : ''}`,
          html: `<p>${lecturerDisplayName} sent you an absence query.</p><p><strong>Title:</strong> ${title}</p><p>${message}</p>${queryEvidence?.fileName ? `<p><strong>Evidence attached:</strong> ${queryEvidence.fileName}</p>` : ''}`,
        });
      }
    } catch (emailError) {
      console.warn('Absence query email failed:', emailError.message);
    }

    const queryNotification = buildQueryNotification({
      query,
      title: 'New absence query received',
      description: `${lecturerDisplayName} sent "${title}"${queryEvidence?.fileName ? ` with evidence attached (${queryEvidence.fileName})` : ''}.`,
      tone: 'amber',
    });
    emitQueryNotifications(req, {
      query,
      userIds: [student.id, resolvedLecturerId, req.user.id],
      notification: queryNotification,
    });

    res.status(201).json({ success: true, message: 'Absence query sent', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQueries = async (req, res) => {
  try {
    const where = req.user.role === 'student'
      ? { studentId: req.user.id }
      : req.user.role === 'lecturer'
        ? { lecturerId: req.user.id }
        : {};

    const queries = await AbsenceQuery.findAll({
      where,
      include: [
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'email', 'matricNumber'] },
        { model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { model: User, as: 'escalatedBy', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
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
    const responseEvidence = normalizeEvidencePayload(req.body, 'response');
    const query = await AbsenceQuery.findByPk(req.params.id, {
      include: [{ model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] }],
    });

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
    query.responseEvidenceFileName = responseEvidence?.fileName || null;
    query.responseEvidenceMimeType = responseEvidence?.mimeType || null;
    query.responseEvidenceData = responseEvidence?.data || null;
    query.responseEvidenceNote = responseEvidence?.note || null;
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
          text: `${studentName} responded to the absence query.\n\nTitle: ${query.title}\n\nResponse: ${response}${responseEvidence?.fileName ? `\n\nEvidence attached: ${responseEvidence.fileName}` : ''}`,
          html: `<p>${studentName} responded to the absence query.</p><p><strong>Title:</strong> ${query.title}</p><p><strong>Response:</strong> ${response}</p>${responseEvidence?.fileName ? `<p><strong>Evidence attached:</strong> ${responseEvidence.fileName}</p>` : ''}`,
        });
      }
    } catch (emailError) {
      console.warn('Absence response email failed:', emailError.message);
    }

    const student = await User.findByPk(query.studentId);
    const responseNotification = buildQueryNotification({
      query,
      title: 'Student responded to absence query',
      description: `${[student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'A student'} replied to "${query.title}"${responseEvidence?.fileName ? ` and attached ${responseEvidence.fileName}` : ''}.`,
      tone: responseEvidence?.fileName ? 'emerald' : 'blue',
    });
    emitQueryNotifications(req, {
      query,
      userIds: [query.lecturerId, query.studentId],
      notification: responseNotification,
    });

    res.json({ success: true, message: 'Response submitted', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.escalateQuery = async (req, res) => {
  try {
    const { reason } = req.body;
    const escalationReason = sanitizeText(reason || req.body.escalationReason || 'Requesting admin review for this query.');
    const query = await AbsenceQuery.findByPk(req.params.id);

    if (!query) {
      return res.status(404).json({ success: false, message: 'Query not found' });
    }

    const escalationPolicy = canEscalateAbsenceQuery({ actor: req.user, query });
    if (!escalationPolicy.allowed) {
      return res.status(403).json({ success: false, message: escalationPolicy.message });
    }

    query.escalationState = 'requested';
    query.escalatedAt = new Date();
    query.escalatedByUserId = req.user.id;
    query.escalationReason = escalationReason;
    await query.save();

    await logAuditEvent({
      req,
      action: 'absence_query.escalated',
      targetType: 'absence_query',
      targetId: query.id,
      metadata: {
        sessionId: query.sessionId,
        studentId: query.studentId,
        lecturerId: query.lecturerId,
        escalationReason,
      },
    });

    const escalatorName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.role;
    const escalationNotification = buildQueryNotification({
      query,
      title: 'Absence query escalated to admin',
      description: `${escalatorName} escalated "${query.title}"${escalationReason ? `: ${escalationReason}` : ''}.`,
      tone: 'rose',
    });
    emitQueryNotifications(req, {
      query,
      userIds: [query.studentId, query.lecturerId],
      roles: ['admin'],
      notification: escalationNotification,
    });

    res.json({ success: true, message: 'Query escalated for admin review', data: query });
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
    if (query.escalationState !== 'resolved') {
      query.escalationState = query.escalationState === 'requested' ? 'resolved' : query.escalationState;
    }
    if (req.user.role === 'admin' || query.escalationState === 'resolved') {
      query.adminResolvedAt = query.adminResolvedAt || new Date();
    }
    await query.save();

    await logAuditEvent({
      req,
      action: 'absence_query.closed',
      targetType: 'absence_query',
      targetId: query.id,
      metadata: { sessionId: query.sessionId, studentId: query.studentId },
    });

    const closedNotification = buildQueryNotification({
      query,
      title: 'Absence query closed',
      description: `The absence query "${query.title}" has been closed.`,
      tone: 'emerald',
    });
    emitQueryNotifications(req, {
      query,
      userIds: [query.studentId, query.lecturerId],
      notification: closedNotification,
    });

    res.json({ success: true, message: 'Query closed', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
