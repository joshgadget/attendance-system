const { Session, Attendance } = require('../models');
const { Op } = require('sequelize');

/**
 * CRITICAL SECURITY MIDDLEWARE
 * Ensures only students who are physically in class can sign attendance
 * Validates: Session code, timing, location (optional), and prevents duplicates
 */

// Validate session code and check if session is active
const validateSessionAccess = async (req, res, next) => {
  try {
    const { session_code } = req.body;
    
    if (!session_code) {
      return res.status(400).json({
        success: false,
        message: 'Session code is required.'
      });
    }

    // Find active session with this code
    const session = await Session.findOne({
      where: {
        session_code: session_code.toUpperCase().trim(),
        status: 'active'
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired session code. Please check with your lecturer.'
      });
    }

    // Check if session time is valid (can only sign within session duration + 15 min grace)
    const sessionStart = new Date(`${session.date}T${session.start_time}`);
    const sessionEnd = new Date(sessionStart.getTime() + session.duration_minutes * 60000);
    const now = new Date();
    const gracePeriod = 15 * 60000; // 15 minutes grace period after session ends

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

    // Attach session to request for later use
    req.attendanceSession = session;
    
    next();
  } catch (error) {
    console.error('Session validation error:', error);
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
        session_id: session.id,
        student_id: studentId
      }
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'You have already marked attendance for this session.',
        data: {
          status: existingAttendance.status,
          marked_at: existingAttendance.marked_at
        }
      });
    }

    next();
  } catch (error) {
    console.error('Duplicate check error:', error);
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
        student_id: studentId,
        marked_at: {
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
    console.error('Rapid marking check error:', error);
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
      where: { student_id: studentId },
      order: [['marked_at', 'DESC']],
      limit: 5
    });

    if (recentAttendances.length >= 3) {
      // Check if IP is consistent (allow 2 different IPs max - for mobile/WiFi switching)
      const uniqueIPs = [...new Set(recentAttendances.map(a => a.device_ip))];
      
      if (uniqueIPs.length > 2 && !uniqueIPs.includes(currentIP)) {
        // Flag for review but don't block (could be legitimate network change)
        req.deviceFlagged = true;
      }
    }

    next();
  } catch (error) {
    console.error('Device validation error:', error);
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