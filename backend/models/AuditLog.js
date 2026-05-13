const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    actorRole: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    targetType: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    targetId: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    campus: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    faculty: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = AuditLog;
