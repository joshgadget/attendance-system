const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CourseAudience = sequelize.define(
  'CourseAudience',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'courses',
        key: 'id',
      },
    },
    faculty: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    program: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    level: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'course_audiences',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['courseId', 'faculty', 'department', 'program', 'level'],
      },
    ],
  }
);

module.exports = CourseAudience;
