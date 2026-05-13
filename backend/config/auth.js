module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'defaultsecret',
    expiresIn: process.env.JWT_EXPIRE || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'defaultrefresh',
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
