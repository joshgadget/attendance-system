const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authMiddleware = require('../middleware/authMiddleware');

// Simple role check middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

const requireAnyRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

// Apply auth to all routes
router.use(authMiddleware);

// Routes
router.post('/sessions', requireRole('lecturer'), attendanceController.createSession);
router.get('/sessions', requireAnyRole('lecturer', 'admin'), attendanceController.getSessions);
router.get('/sessions/:id', requireAnyRole('lecturer', 'admin'), attendanceController.getSession);
router.put('/sessions/:id/close', requireRole('lecturer'), attendanceController.closeSession);
router.post('/mark', requireRole('student'), attendanceController.markAttendance);
router.get('/history', requireRole('student'), attendanceController.getStudentHistory);

module.exports = router;
