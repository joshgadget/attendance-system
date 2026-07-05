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

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isProduction = process.env.NODE_ENV === 'production';

const requiredProductionEnv = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CORS_ORIGIN',
  'FRONTEND_URL',
];

const validateRequiredEnv = () => {
  if (!isProduction) {
    return [];
  }

  return requiredProductionEnv.filter((key) => !String(process.env[key] || '').trim());
};

const getEnvOrFallback = (key, fallback) => {
  const value = String(process.env[key] || '').trim();
  if (value) {
    return value;
  }

  if (isProduction) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return fallback;
};

module.exports = {
  isProduction,
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMaxRequests: toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  attendanceRateLimitWindowMs: toNumber(process.env.ATTENDANCE_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  attendanceRateLimitMaxRequests: toNumber(process.env.ATTENDANCE_RATE_LIMIT_MAX_REQUESTS, 5),
  attendanceRadiusMeters: toNumber(process.env.ATTENDANCE_RADIUS_METERS, 35),
  attendanceMaxLocationAccuracy: toNumber(process.env.ATTENDANCE_MAX_LOCATION_ACCURACY_METERS, 30),
  validateRequiredEnv,
  getEnvOrFallback,
};
