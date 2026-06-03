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
  queryEvidenceFileName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  queryEvidenceMimeType: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  queryEvidenceData: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  queryEvidenceNote: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'responded', 'closed'),
    defaultValue: 'pending'
  },
  studentResponse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  responseEvidenceFileName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  responseEvidenceMimeType: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  responseEvidenceData: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  responseEvidenceNote: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  escalationState: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'none'
  },
  escalatedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  escalatedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  escalationReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  adminResolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  adminResolvedAt: {
    type: DataTypes.DATE,
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
