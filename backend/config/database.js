const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const useSsl = process.env.DB_SSL !== 'false';
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it to your Supabase Postgres connection string.');
}

const commonOptions = {
  dialect: 'postgres',
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
    idle: 10000,
  }
};

const sequelize = new Sequelize(databaseUrl, commonOptions);

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Supabase/Postgres database connection established successfully.');
  } catch (error) {
    logger.error('Unable to connect to Supabase/Postgres database:', error);
    throw error;
  }
};

module.exports = { sequelize, testConnection };
