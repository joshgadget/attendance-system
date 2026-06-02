const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const useSsl = process.env.DB_SSL !== 'false';
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: useSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized,
          },
        }
      : {},
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('MySQL Database connection established successfully.');
  } catch (error) {
    logger.error('Unable to connect to MySQL database:', error);
    throw error;
  }
};

module.exports = { sequelize, testConnection };
