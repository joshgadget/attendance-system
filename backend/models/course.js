const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  courseCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  courseName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  semester: {
    type: DataTypes.ENUM('rain', 'harmattan'),
    allowNull: false
  },
  academicYear: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  faculty: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  department: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  program: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  level: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  lecturerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'courses',
  timestamps: true
});

module.exports = Course;
