const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CourseSchedule = sequelize.define(
  'CourseSchedule',
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
    dayOfWeek: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    venue: {
      type: DataTypes.STRING(160),
      allowNull: true,
    },
    notifyMinutesBefore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'course_schedules',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['courseId', 'dayOfWeek', 'startTime', 'venue'],
      },
    ],
  }
);

module.exports = CourseSchedule;
