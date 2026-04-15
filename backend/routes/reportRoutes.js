const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
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

// Apply auth to all routes
router.use(authMiddleware);

// Routes
router.get('/course/:courseId', requireRole('lecturer'), reportController.getCourseReport);
router.get('/export/:courseId', requireRole('lecturer'), reportController.exportReport);
router.get('/system', requireRole('admin'), reportController.getSystemReport);
router.get('/system/export', requireRole('admin'), reportController.exportSystemReport);
router.get('/me', requireRole('student'), reportController.getMyAttendanceReport);
router.get('/me/export', requireRole('student'), reportController.exportMyAttendanceReport);

module.exports = router;
