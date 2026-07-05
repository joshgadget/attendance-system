const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AttendanceAttempt = sequelize.define('AttendanceAttempt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'sessions', key: 'id' },
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'courses', key: 'id' },
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  accuracy: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  insidePolygon: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  deviceInfo: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  locationTimestamp: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  accepted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  rejectionReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('metadata');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    set(value) {
      if (value) {
        this.setDataValue('metadata', JSON.stringify(value));
      } else {
        this.setDataValue('metadata', null);
      }
    },
  },
}, {
  tableName: 'attendance_attempts',
  timestamps: true,
  indexes: [
    { fields: ['studentId', 'sessionId'] },
    { fields: ['accepted'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = AttendanceAttempt;
