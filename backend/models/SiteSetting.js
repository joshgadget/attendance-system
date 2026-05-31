const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SiteSetting = sequelize.define('SiteSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  isMaintenanceEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_maintenance_enabled',
  },
  badge: {
    type: DataTypes.STRING(120),
    allowNull: false,
    defaultValue: 'Temporary maintenance',
  },
  title: {
    type: DataTypes.STRING(180),
    allowNull: false,
    defaultValue: 'Site temporarily unavailable',
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "We're applying a few updates right now. Please check back soon. All access is currently paused while maintenance is active.",
  },
  footer: {
    type: DataTypes.STRING(180),
    allowNull: false,
    defaultValue: 'Everything is locked during maintenance',
  },
  updatedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'updated_by_user_id',
  },
}, {
  tableName: 'site_settings',
  timestamps: true,
  underscored: true,
});

module.exports = SiteSetting;
