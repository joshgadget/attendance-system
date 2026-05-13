const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AbsenceQuery = sequelize.define('AbsenceQuery', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  lecturerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
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
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'sessions',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'responded', 'closed'),
    defaultValue: 'pending'
  },
  studentResponse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  respondedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'absence_queries',
  timestamps: true
});

module.exports = AbsenceQuery;
