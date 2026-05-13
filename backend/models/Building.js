const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OOU_BUILDINGS = [
  { name: 'CSE Lecture Hall 1', tag: 'CSE-LH1', campus: 'Ago-Iwoye Main Campus', latitude: 6.9886, longitude: 3.9027, radiusMeters: 60 },
  { name: 'CSE Lecture Hall 2', tag: 'CSE-LH2', campus: 'Ago-Iwoye Main Campus', latitude: 6.9889, longitude: 3.9031, radiusMeters: 60 },
  { name: 'CSE Laboratory Block', tag: 'CSE-LAB', campus: 'Ago-Iwoye Main Campus', latitude: 6.9882, longitude: 3.9023, radiusMeters: 50 },
  { name: 'Engineering Lecture Hall A', tag: 'ENG-LHA', campus: 'Ago-Iwoye Main Campus', latitude: 6.9901, longitude: 3.9045, radiusMeters: 70 },
  { name: 'Engineering Lecture Hall B', tag: 'ENG-LHB', campus: 'Ago-Iwoye Main Campus', latitude: 6.9904, longitude: 3.9050, radiusMeters: 70 },
  { name: 'Engineering Workshop', tag: 'ENG-WKSP', campus: 'Ago-Iwoye Main Campus', latitude: 6.9897, longitude: 3.9041, radiusMeters: 55 },
  { name: 'Engineering Drawing Studio', tag: 'ENG-DRW', campus: 'Ago-Iwoye Main Campus', latitude: 6.9908, longitude: 3.9047, radiusMeters: 50 },
  { name: 'Management Sciences Auditorium', tag: 'MGT-AUD', campus: 'Ago-Iwoye Main Campus', latitude: 6.9872, longitude: 3.9010, radiusMeters: 80 },
  { name: 'Management Sciences Seminar Room', tag: 'MGT-SEM', campus: 'Ago-Iwoye Main Campus', latitude: 6.9875, longitude: 3.9015, radiusMeters: 55 },
  { name: 'Social Sciences Block A', tag: 'SOC-A', campus: 'Ago-Iwoye Main Campus', latitude: 6.9862, longitude: 3.8998, radiusMeters: 65 },
  { name: 'Social Sciences Block B', tag: 'SOC-B', campus: 'Ago-Iwoye Main Campus', latitude: 6.9865, longitude: 3.9002, radiusMeters: 65 },
  { name: 'Law Faculty Moot Court', tag: 'LAW-MOOT', campus: 'Ago-Iwoye Main Campus', latitude: 6.9855, longitude: 3.8985, radiusMeters: 60 },
  { name: 'Law Faculty Lecture Room', tag: 'LAW-LR', campus: 'Ago-Iwoye Main Campus', latitude: 6.9858, longitude: 3.8990, radiusMeters: 55 },
  { name: 'Medical Sciences Lecture Hall', tag: 'MED-LH', campus: 'Ago-Iwoye Main Campus', latitude: 6.9920, longitude: 3.9060, radiusMeters: 75 },
  { name: 'Anatomy Theatre', tag: 'MED-ANAT', campus: 'Ago-Iwoye Main Campus', latitude: 6.9924, longitude: 3.9065, radiusMeters: 50 },
  { name: 'Physiology Lab', tag: 'MED-PHYS', campus: 'Ago-Iwoye Main Campus', latitude: 6.9917, longitude: 3.9057, radiusMeters: 50 },
  { name: 'Agriculture Lecture Hall', tag: 'AGR-LH', campus: 'Ago-Iwoye Main Campus', latitude: 6.9933, longitude: 3.9075, radiusMeters: 65 },
  { name: 'Agriculture Lab Block', tag: 'AGR-LAB', campus: 'Ago-Iwoye Main Campus', latitude: 6.9936, longitude: 3.9079, radiusMeters: 55 },
  { name: 'Main Auditorium', tag: 'MAIN-AUD', campus: 'Ago-Iwoye Main Campus', latitude: 6.9878, longitude: 3.9018, radiusMeters: 100 },
  { name: 'Postgraduate Hall', tag: 'PG-HALL', campus: 'Ago-Iwoye Main Campus', latitude: 6.9870, longitude: 3.9005, radiusMeters: 70 },
  { name: 'Senate Building Annexe', tag: 'SENATE-ANN', campus: 'Ago-Iwoye Main Campus', latitude: 6.9866, longitude: 3.9000, radiusMeters: 60 },
  { name: 'ICT Centre', tag: 'ICT', campus: 'Ago-Iwoye Main Campus', latitude: 6.9893, longitude: 3.9038, radiusMeters: 55 },
  { name: 'University Library Hall', tag: 'LIB-HALL', campus: 'Ago-Iwoye Main Campus', latitude: 6.9880, longitude: 3.9022, radiusMeters: 60 },
  { name: 'Distance Learning Centre', tag: 'DLC', campus: 'Ago-Iwoye Main Campus', latitude: 6.9848, longitude: 3.8975, radiusMeters: 70 },
];

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

Building.seedOOU = async () => {
  for (const building of OOU_BUILDINGS) {
    await Building.findOrCreate({
      where: { tag: building.tag },
      defaults: { ...building, isActive: true },
    });
  }
};

module.exports = Building;
