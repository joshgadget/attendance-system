const env = require('../utils/env');

module.exports = {
  jwt: {
    secret: env.getEnvOrFallback('JWT_SECRET', 'dev-jwt-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRE || '15m',
    refreshSecret: env.getEnvOrFallback('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
  },
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12
  },
  roles: {
    ADMIN: 'admin',
    LECTURER: 'lecturer',
    STUDENT: 'student'
  }
};
