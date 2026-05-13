const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Course = sequelize.define('Course', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  courseCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    // OOU course code format: e.g. CSC301, EEE402, LAW501
    validate: {
      isOOUCourseCode(value) {
        if (!/^[A-Z]{2,4}\d{3}$/i.test(value)) {
          throw new Error('Course code must follow OOU format e.g. CSC301, EEE402');
        }
      },
    },
  },

  courseName: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  creditUnits: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 3 },

  semester: {
    type: DataTypes.ENUM('rain', 'harmattan'),
    allowNull: false,
    comment: 'OOU uses Rain and Harmattan semesters',
  },

  academicYear: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isOOUAcademicYear(value) {
        if (!/^\d{4}\/\d{4}$/.test(value)) {
          throw new Error('Academic year must be in format YYYY/YYYY e.g. 2024/2025');
        }
      },
    },
  },

  faculty: { type: DataTypes.STRING(120), allowNull: true },
  department: { type: DataTypes.STRING(120), allowNull: true },
  program: { type: DataTypes.STRING(120), allowNull: true },

  level: {
    type: DataTypes.ENUM('100', '200', '300', '400', '500', '600', 'PG'),
    allowNull: true,
  },

  lecturerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },

  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

  // Minimum attendance percentage required by OOU policy (default 75%)
  minAttendancePercent: {
    type: DataTypes.INTEGER,
    defaultValue: 75,
    validate: { min: 0, max: 100 },
  },
}, {
  tableName: 'courses',
  timestamps: true,
});

module.exports = Course;
