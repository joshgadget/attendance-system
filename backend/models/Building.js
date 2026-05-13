const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Building = sequelize.define(
  'Building',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    tag: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    campus: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    radiusMeters: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 80,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'buildings',
    timestamps: true,
  }
);

module.exports = Building;
