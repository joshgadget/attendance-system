const rateLimit = require('express-rate-limit');
const env = require('../utils/env');

const authRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 20,
  message: { success: false, message: 'Too many auth attempts' }
});

const attendanceRateLimiter = rateLimit({
  windowMs: env.attendanceRateLimitWindowMs,
  max: env.attendanceRateLimitMaxRequests,
  message: { success: false, message: 'Too many attendance attempts. Please wait a moment and try again.' },
});

module.exports = { authRateLimiter, attendanceRateLimiter };
