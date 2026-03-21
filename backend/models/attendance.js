const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'sessions',
      key: 'id'
    }
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('present', 'absent', 'late', 'excused'),
    defaultValue: 'present'
  },
  markedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  markedBy: {
    type: DataTypes.ENUM('self', 'lecturer', 'system'),
    defaultValue: 'self'
  },
  verificationMethod: {
    type: DataTypes.ENUM('code', 'qr', 'manual', 'biometric'),
    defaultValue: 'code'
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  deviceInfo: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'attendance',
  timestamps: true
});

module.exports = Attendance;