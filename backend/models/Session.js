const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  lecturerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  sessionCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  venue: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'closed', 'cancelled'),
    defaultValue: 'active'
  },
  maxAttendanceTime: {
    type: DataTypes.INTEGER,
    defaultValue: 15
  },
  geofenceLatitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true
  },
  geofenceLongitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true
  },
  geofenceRadiusMeters: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  lecturerLatitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  lecturerLongitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  lecturerLocationAccuracy: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  sessionKey: {
    type: DataTypes.STRING(10),
    allowNull: true,
    unique: true,
  },
  qrToken: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  attendanceRadiusMeters: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 35,
  },
}, {
  tableName: 'sessions',
  timestamps: true
});

module.exports = Session;
