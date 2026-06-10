const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ClassReminderLog = sequelize.define(
  'ClassReminderLog',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    courseScheduleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'course_schedule_id',
      references: {
        model: 'course_schedules',
        key: 'id',
      },
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'course_id',
      references: {
        model: 'courses',
        key: 'id',
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    channel: {
      type: DataTypes.ENUM('in_app', 'email'),
      allowNull: false,
      defaultValue: 'in_app',
    },
    occurrenceAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'occurrence_at',
    },
    reminderAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'reminder_at',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    deliveryStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
      field: 'delivery_status',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
  },
  {
    tableName: 'class_reminder_logs',
    timestamps: true,
    indexes: [
      {
        name: 'crl_occurrence_unique',
        unique: true,
        fields: ['course_schedule_id', 'user_id', 'channel', 'occurrence_at'],
      },
      {
        name: 'crl_user_created_idx',
        fields: ['user_id', 'createdAt'],
      },
      {
        name: 'crl_course_created_idx',
        fields: ['course_id', 'createdAt'],
      },
    ],
  }
);

module.exports = ClassReminderLog;
