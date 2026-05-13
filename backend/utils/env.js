const parseOrigins = (value) => {
  if (!value) {
    return ['http://localhost:3000'];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch (error) {
        return item.replace(/\/+$/, '');
      }
    })
    .filter(Boolean);
};

module.exports = {
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  attendanceRateLimitWindowMs: Number(process.env.ATTENDANCE_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  attendanceRateLimitMaxRequests: Number(process.env.ATTENDANCE_RATE_LIMIT_MAX_REQUESTS || 5),
};
