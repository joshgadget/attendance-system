/**
 * OOU Attendance Management System - Server Entry Point
 * Olabisi Onabanjo University, Ago-Iwoye
 *
 * Upgraded from single-department to full university scale.
 * All geofencing, security, and role enforcement is active.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const { sequelize, setupAssociations } = require('./models');
const { setupSocketHandlers } = require('./websocket/socketHandler');
const env = require('./utils/env');

const app = express();
const server = http.createServer(app);

// ── CORS config ─────────────────────────────────────────────────────────────
const corsOptions = {
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Socket.IO setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: env.corsOrigins, methods: ['GET', 'POST'] },
  pingTimeout: 60000,
});
app.set('io', io);
setupSocketHandlers(io);

// ── Global middleware ───────────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Global rate limiter — 200 requests per 15 minutes per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again shortly.' },
}));

// Stricter rate limit on auth endpoints — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

// Strictest rate limit on attendance marking — 5 per minute per IP
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many attendance requests. Please wait.' },
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'OOU Attendance System is running',
    university: 'Olabisi Onabanjo University',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/registry', require('./routes/registryRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/buildings', require('./routes/buildingRoutes'));
app.use('/api/attendance', attendanceLimiter, require('./routes/attendanceRoutes'));
app.use('/api/queries', require('./routes/absenceQueryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ── Boot sequence ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    setupAssociations();
    await testConnection();
    await sequelize.sync({ alter: true }); // alter:true to apply model changes without dropping data

    // Seed OOU campus buildings on startup
    const { Building } = require('./models');
    await Building.seedOOU();

    console.log('Database connected, synced, and OOU buildings seeded.');
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`OOU Attendance System running on port ${PORT}`);
    console.log(`University: Olabisi Onabanjo University, Ago-Iwoye`);
  });
};

startServer();
