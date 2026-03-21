const { AbsenceQuery, User, Session, Course } = require('../models');

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
    }

    const query = await AbsenceQuery.create({
      lecturerId: req.user.id,
      studentId,
      sessionId: sessionId || null,
      title,
      message
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

    res.json({ success: true, message: 'Query closed', data: query });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
