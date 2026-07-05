const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AttendanceQrChallenge = sequelize.define('AttendanceQrChallenge', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sessions', key: 'id' } },
  nonce: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  issuedAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true },
  usedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  signatureHash: { type: DataTypes.STRING(128), allowNull: false },
}, {
  tableName: 'attendance_qr_challenges',
  timestamps: true,
  indexes: [
    { fields: ['sessionId'] },
    { fields: ['nonce'], unique: true },
    { fields: ['expiresAt'] },
  ],
});

module.exports = AttendanceQrChallenge;
