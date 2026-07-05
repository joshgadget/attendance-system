const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TrustedDevice = sequelize.define('TrustedDevice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  deviceLabel: { type: DataTypes.STRING(200), allowNull: true },
  deviceFingerprint: { type: DataTypes.STRING(128), allowNull: false },
  credentialId: { type: DataTypes.STRING(255), allowNull: true },
  publicKey: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'revoked', 'pending'), defaultValue: 'active' },
  lastUsedAt: { type: DataTypes.DATE, allowNull: true },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'trusted_devices',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['deviceFingerprint'] },
    { fields: ['status'] },
    { unique: true, fields: ['userId', 'deviceFingerprint'] },
  ],
});

module.exports = TrustedDevice;
