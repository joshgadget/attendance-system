const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'sessions', key: 'id' },
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'courses', key: 'id' },
  },
  status: {
    type: DataTypes.ENUM('present', 'late', 'absent', 'excused'),
    allowNull: false,
    defaultValue: 'present',
  },
  markedAt: { type: DataTypes.DATE, allowNull: true },
  markedBy: {
    type: DataTypes.ENUM('self', 'lecturer', 'admin'),
    defaultValue: 'self',
  },
  verificationMethod: {
    type: DataTypes.ENUM('qr', 'manual', 'biometric'),
    defaultValue: 'qr',
  },
  // GPS data stored for audit trail
  location: { type: DataTypes.STRING(100), allowNull: true },
  locationAccuracy: { type: DataTypes.FLOAT, allowNull: true },
  distanceFromClass: { type: DataTypes.INTEGER, allowNull: true, comment: 'Metres from building centre at time of marking' },

  // Device fingerprinting for anti-proxy audit
  deviceInfo: { type: DataTypes.STRING(500), allowNull: true },
  deviceFlagged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if the device showed anomalous behaviour at time of marking',
  },
}, {
  tableName: 'attendance',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['sessionId', 'studentId'] },
    { fields: ['studentId'] },
    { fields: ['courseId'] },
    { fields: ['status'] },
    { fields: ['deviceFlagged'] },
  ],
});

module.exports = Attendance;
