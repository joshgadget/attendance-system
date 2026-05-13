const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StudentRegistry = sequelize.define(
  'StudentRegistry',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    matricNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    otherName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    faculty: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    program: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    campus: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    level: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    admissionYear: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    claimedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'student_registry',
    timestamps: true,
  }
);

module.exports = StudentRegistry;
