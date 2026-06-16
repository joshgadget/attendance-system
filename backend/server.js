const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const { sequelize, setupAssociations, Building } = require('./models');
const { ensureSchemaGuard } = require('./utils/schemaGuard');
const env = require('./utils/env');
const logger = require('./utils/logger');
const { startClassReminderService } = require('./utils/classReminderService');

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const io = new Server(server, {
  cors: { origin: env.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] },
});

app.set('io', io);
require('./websocket/socketHandler')(io);
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: 'Server is running',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      success: true,
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed', { message: error.message });
    res.status(503).json({
      success: false,
      status: 'not_ready',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/client-events', require('./routes/clientEventRoutes'));
app.use('/api/site', require('./routes/siteRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/registry', require('./routes/registryRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/buildings', require('./routes/buildingRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/queries', require('./routes/absenceQueryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  logger.error('API error', {
    message: err.message,
    statusCode,
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
  });
  res.status(err.statusCode || 500).json({
    success: false,
    message: env.isProduction && statusCode >= 500
      ? 'Something went wrong on the server. Please try again.'
      : (err.message || 'Internal Server Error'),
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    const missingEnv = env.validateRequiredEnv();
    if (missingEnv.length > 0) {
      throw new Error(`Missing required production environment variables: ${missingEnv.join(', ')}`);
    }

    setupAssociations();
    await testConnection();
    const appliedChanges = await ensureSchemaGuard(sequelize);
    await sequelize.sync();
    if (process.env.SEED_OOU_BUILDINGS === 'true' && typeof Building.seedOOU === 'function') {
      await Building.seedOOU();
      logger.info('OOU building seed completed');
    }
    if (appliedChanges.length > 0) {
      logger.info(`Schema guard applied: ${appliedChanges.join(', ')}`);
    }
    logger.info('Database connected and synced successfully');
  } catch (error) {
    logger.error('Database startup failed', { message: error.message, stack: error.stack });
    process.exit(1);
  }

  server.listen(PORT, () => {
    logger.info(`Attendance System API running on port ${PORT}`);
    startClassReminderService(io);
  });
};

startServer();
