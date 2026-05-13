const rateLimit = require('express-rate-limit');
const env = require('../utils/env');

const authRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 5,
  message: { success: false, message: 'Too many auth attempts' }
});

module.exports = { authRateLimiter };
