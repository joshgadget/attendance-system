const { TrustedDevice, AttendanceRiskEvent, AttendanceAttempt, Session, User, Course } = require('../models');
const { getOrCreateDeviceFingerprint } = require('../services/attendanceSecurityService');
const env = require('../utils/env');
const logger = require('../utils/logger');

exports.registerDevice = async (req, res) => {
  try {
    const { deviceLabel } = req.body;
    const fingerprint = getOrCreateDeviceFingerprint(req.headers);

    const existing = await TrustedDevice.findOne({
      where: { userId: req.user.id, deviceFingerprint: fingerprint },
    });

    if (existing) {
      if (existing.status === 'active') {
        return res.json({ success: true, data: existing, message: 'Device is already registered.' });
      }
      if (existing.status === 'revoked') {
        existing.status = 'active';
        existing.revokedAt = null;
        await existing.save();
        return res.json({ success: true, data: existing, message: 'Device re-registered successfully.' });
      }
    }

    const device = await TrustedDevice.create({
      userId: req.user.id,
      deviceLabel: deviceLabel || `${req.headers['user-agent']?.slice(0, 80) || 'Unknown device'}`,
      deviceFingerprint: fingerprint,
      status: 'active',
    });

    res.status(201).json({ success: true, data: device, message: 'Device registered successfully.' });
  } catch (error) {
    logger.error('Device registration error', { message: error.message });
    res.status(500).json({ success: false, message: 'Device could not be registered.' });
  }
};

exports.listDevices = async (req, res) => {
  try {
    const devices = await TrustedDevice.findAll({
      where: { userId: req.user.id },
      order: [['lastUsedAt', 'DESC NULLS LAST']],
    });
    res.json({ success: true, data: devices });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Devices could not be loaded.' });
  }
};

exports.revokeDevice = async (req, res) => {
  try {
    const device = await TrustedDevice.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    device.status = 'revoked';
    device.revokedAt = new Date();
    await device.save();

    res.json({ success: true, message: 'Device revoked successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Device could not be revoked.' });
  }
};

exports.getPendingReview = async (req, res) => {
  try {
    const where = { action: 'review' };

    if (req.user.role === 'lecturer') {
      const courses = await Course.findAll({ where: { lecturerId: req.user.id }, attributes: ['id'] });
      const courseIds = courses.map((c) => c.id);
      const sessions = await Session.findAll({ where: { courseId: courseIds }, attributes: ['id'] });
      where.sessionId = sessions.map((s) => s.id);
    }

    const events = await AttendanceRiskEvent.findAll({
      where,
      include: [
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'email', 'matricNumber'] },
        { model: Session, as: 'session', include: [{ model: Course, as: 'course', attributes: ['courseCode', 'courseName'] }] },
        { model: AttendanceAttempt, as: 'attendanceAttempt' },
      ],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Pending review error', { message: error.message });
    res.status(500).json({ success: false, message: 'Review data could not be loaded.' });
  }
};

exports.reviewAction = async (req, res) => {
  try {
    const { action, note } = req.body;
    const event = await AttendanceRiskEvent.findByPk(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Risk event not found.' });
    }

    if (!['allow', 'reject', 'review'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }

    event.action = action;
    event.reviewedByUserId = req.user.id;
    event.reviewNote = note || null;
    event.reviewedAt = new Date();
    await event.save();

    res.json({ success: true, message: `Attendance ${action === 'allow' ? 'approved' : action === 'reject' ? 'kept rejected' : 'kept for review'}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Review action could not be saved.' });
  }
};

exports.getSuspiciousAttempts = async (req, res) => {
  try {
    const { sessionId } = req.query;
    const where = {};

    if (sessionId) where.sessionId = sessionId;

    if (req.user.role === 'lecturer') {
      const courses = await Course.findAll({ where: { lecturerId: req.user.id }, attributes: ['id'] });
      const courseIds = courses.map((c) => c.id);
      const sessions = await Session.findAll({ where: { courseId: courseIds }, attributes: ['id'] });
      where.sessionId = sessions.map((s) => s.id);
    }

    const attempts = await AttendanceAttempt.findAll({
      where,
      include: [
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'email', 'matricNumber'] },
        { model: Session, as: 'session', include: [{ model: Course, as: 'course' }] },
        { model: AttendanceRiskEvent, as: 'riskEvents' },
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    res.json({ success: true, data: attempts });
  } catch (error) {
    logger.error('Suspicious attempts error', { message: error.message });
    res.status(500).json({ success: false, message: 'Attempts could not be loaded.' });
  }
};
