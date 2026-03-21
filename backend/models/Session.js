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
  }
}, {
  tableName: 'sessions',
  timestamps: true
});

module.exports = Session;
