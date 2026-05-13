const express = require('express');
const router = express.Router();
const { register, studentLookup, getPublicCourses, studentSignup, login, refreshToken, getMe, logout, forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const { authRateLimiter } = require('../middleware/securityMiddleware');

router.post('/login', authRateLimiter, login);
router.post('/refresh', authRateLimiter, refreshToken);
router.get('/student-lookup/:matricNumber', authRateLimiter, studentLookup);
router.get('/public-courses', getPublicCourses);
router.post('/student-signup', authRateLimiter, studentSignup);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);
router.post('/change-password', authMiddleware, changePassword);

router.post('/register', authMiddleware, roleMiddleware('admin'), register);
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

module.exports = router;
