const { Session, Attendance } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

const validateSessionAccess = async (req, res, next) => {
  try {
    const { sessionKey } = req.body;
    
    if (!sessionKey) {
      return res.status(400).json({
        success: false,
        message: 'Session key is required.'
      });
    }

    const session = await Session.findOne({
      where: {
        sessionKey: String(sessionKey).trim().toUpperCase(),
        status: 'active'
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired session key. Please check with your lecturer.'
      });
    }

    const sessionStart = new Date(`${session.date}T${session.startTime}`);
    const sessionEnd = new Date(`${session.date}T${session.endTime}`);
    const now = new Date();
    const gracePeriod = (session.maxAttendanceTime || 15) * 60000;

    if (now < sessionStart) {
      return res.status(403).json({
        success: false,
        message: 'Session has not started yet.'
      });
    }

    if (now > new Date(sessionEnd.getTime() + gracePeriod)) {
      return res.status(403).json({
        success: false,
        message: 'Session has ended. Attendance can no longer be marked.'
      });
    }

    req.attendanceSession = session;
    
    next();
  } catch (error) {
    logger.error('Session validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating session.'
    });
  }
};

// Check if student already marked attendance for this session
const checkDuplicateAttendance = async (req, res, next) => {
  try {
    const session = req.attendanceSession;
    const studentId = req.user.id;

    const existingAttendance = await Attendance.findOne({
      where: {
        sessionId: session.id,
        studentId
      }
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'You have already marked attendance for this session.',
        data: {
          status: existingAttendance.status,
          markedAt: existingAttendance.markedAt
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Duplicate check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking attendance status.'
    });
  }
};

// Prevent rapid attendance marking (anti-spam)
const preventRapidMarking = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000);

    const recentAttendance = await Attendance.findOne({
      where: {
        studentId,
        markedAt: {
          [Op.gte]: fiveMinutesAgo
        }
      }
    });

    if (recentAttendance) {
      return res.status(429).json({
        success: false,
        message: 'Please wait a few minutes before marking attendance again.'
      });
    }

    next();
  } catch (error) {
    logger.error('Rapid marking check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking attendance frequency.'
    });
  }
};

// Validate device/IP consistency (optional - prevents account sharing)
const validateDeviceConsistency = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const currentIP = req.ip;

    // Get last 5 attendances for this student
    const recentAttendances = await Attendance.findAll({
      where: { studentId },
      order: [['markedAt', 'DESC']],
      limit: 5
    });

    if (recentAttendances.length >= 3) {
      // Check if IP is consistent (allow 2 different IPs max - for mobile/WiFi switching)
      const deviceInfoList = recentAttendances.map(a => a.deviceInfo || a.location).filter(Boolean);
      const uniqueDevices = [...new Set(deviceInfoList)];
      
      if (uniqueDevices.length > 2 && !uniqueDevices.includes(currentIP)) {
        // Flag for review but don't block (could be legitimate network change)
        req.deviceFlagged = true;
      }
    }

    next();
  } catch (error) {
    logger.error('Device validation error:', error);
    // Don't block on error, just continue
    next();
  }
};

// Combined middleware for attendance marking
const validateAttendanceMarking = [
  validateSessionAccess,
  checkDuplicateAttendance,
  preventRapidMarking,
  validateDeviceConsistency
];

module.exports = {
  validateSessionAccess,
  checkDuplicateAttendance,
  preventRapidMarking,
  validateDeviceConsistency,
  validateAttendanceMarking
};