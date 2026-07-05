const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AttendanceRiskEvent = sequelize.define('AttendanceRiskEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  attendanceAttemptId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'attendance_attempts', key: 'id' } },
  studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  sessionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sessions', key: 'id' } },
  trustedDeviceId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'trusted_devices', key: 'id' } },
  ipAddress: { type: DataTypes.STRING(120), allowNull: true },
  riskScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  riskFlags: { type: DataTypes.TEXT, allowNull: true },
  action: { type: DataTypes.ENUM('allow', 'review', 'reject'), allowNull: false, defaultValue: 'allow' },
  reviewedByUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  reviewNote: { type: DataTypes.TEXT, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'attendance_risk_events',
  timestamps: true,
  indexes: [
    { fields: ['studentId'] },
    { fields: ['sessionId'] },
    { fields: ['riskScore'] },
    { fields: ['action'] },
    { fields: ['reviewedAt'] },
  ],
});

module.exports = AttendanceRiskEvent;
