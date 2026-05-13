const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const {
  oouAttendancePipeline,
} = require('../middleware/attendanceValidationMiddleware');
const attendanceController = require('../controllers/attendanceController');

// ── Lecturer / Admin routes ─────────────────────────────────────────────────
router.post('/sessions', authMiddleware, requireRole('lecturer', 'admin'), attendanceController.createSession);
router.get('/sessions', authMiddleware, requireRole('lecturer', 'admin'), attendanceController.getSessions);
router.get('/sessions/:id', authMiddleware, requireRole('lecturer', 'admin'), attendanceController.getSession);
router.patch('/sessions/:id/close', authMiddleware, requireRole('lecturer', 'admin'), attendanceController.closeSession);

// ── Student route: full OOU security pipeline applied ──────────────────────
router.post('/mark', authMiddleware, requireRole('student'), ...oouAttendancePipeline, attendanceController.markAttendance);

// ── Student history with compliance summary ────────────────────────────────
router.get('/my-history', authMiddleware, requireRole('student'), attendanceController.getStudentHistory);

module.exports = router;
