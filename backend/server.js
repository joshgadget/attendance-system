const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const { sequelize, setupAssociations } = require('./models');
const { ensureSchemaGuard } = require('./utils/schemaGuard');
const env = require('./utils/env');

const app = express();
const server = http.createServer(app);
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
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
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
  res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/registry', require('./routes/registryRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/buildings', require('./routes/buildingRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/queries', require('./routes/absenceQueryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('API error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    setupAssociations();
    await testConnection();
    const appliedChanges = await ensureSchemaGuard(sequelize);
    await sequelize.sync();
    if (appliedChanges.length > 0) {
      console.log(`Schema guard applied: ${appliedChanges.join(', ')}`);
    }
    console.log('Database connected and synced successfully');
  } catch (error) {
    console.error('Database startup failed:', error);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Attendance System API running on port ${PORT}`);
  });
};

startServer();
