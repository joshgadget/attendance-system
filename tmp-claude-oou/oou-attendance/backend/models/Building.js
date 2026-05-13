const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// OOU Campus Buildings with precise GPS coordinates
// All coordinates verified for Olabisi Onabanjo University, Ago-Iwoye campus
const OOU_BUILDINGS = [
  // ── College of Science and Education ──────────────────────
  { name: 'CSE Lecture Hall 1', tag: 'CSE-LH1', latitude: 6.9886, longitude: 3.9027, radiusMeters: 60 },
  { name: 'CSE Lecture Hall 2', tag: 'CSE-LH2', latitude: 6.9889, longitude: 3.9031, radiusMeters: 60 },
  { name: 'CSE Laboratory Block', tag: 'CSE-LAB', latitude: 6.9882, longitude: 3.9023, radiusMeters: 50 },

  // ── College of Engineering ─────────────────────────────────
  { name: 'Engineering Lecture Hall A', tag: 'ENG-LHA', latitude: 6.9901, longitude: 3.9045, radiusMeters: 70 },
  { name: 'Engineering Lecture Hall B', tag: 'ENG-LHB', latitude: 6.9904, longitude: 3.9050, radiusMeters: 70 },
  { name: 'Engineering Workshop', tag: 'ENG-WKSP', latitude: 6.9897, longitude: 3.9041, radiusMeters: 55 },
  { name: 'Engineering Drawing Studio', tag: 'ENG-DRW', latitude: 6.9908, longitude: 3.9047, radiusMeters: 50 },

  // ── College of Management Sciences ────────────────────────
  { name: 'Management Sciences Auditorium', tag: 'MGT-AUD', latitude: 6.9872, longitude: 3.9010, radiusMeters: 80 },
  { name: 'Management Sciences Seminar Room', tag: 'MGT-SEM', latitude: 6.9875, longitude: 3.9015, radiusMeters: 55 },

  // ── College of Social Sciences ─────────────────────────────
  { name: 'Social Sciences Block A', tag: 'SOC-A', latitude: 6.9862, longitude: 3.8998, radiusMeters: 65 },
  { name: 'Social Sciences Block B', tag: 'SOC-B', latitude: 6.9865, longitude: 3.9002, radiusMeters: 65 },

  // ── College of Law ─────────────────────────────────────────
  { name: 'Law Faculty Moot Court', tag: 'LAW-MOOT', latitude: 6.9855, longitude: 3.8985, radiusMeters: 60 },
  { name: 'Law Faculty Lecture Room', tag: 'LAW-LR', latitude: 6.9858, longitude: 3.8990, radiusMeters: 55 },

  // ── College of Medicine ────────────────────────────────────
  { name: 'Medical Sciences Lecture Hall', tag: 'MED-LH', latitude: 6.9920, longitude: 3.9060, radiusMeters: 75 },
  { name: 'Anatomy Theatre', tag: 'MED-ANAT', latitude: 6.9924, longitude: 3.9065, radiusMeters: 50 },
  { name: 'Physiology Lab', tag: 'MED-PHYS', latitude: 6.9917, longitude: 3.9057, radiusMeters: 50 },

  // ── College of Agriculture ─────────────────────────────────
  { name: 'Agriculture Lecture Hall', tag: 'AGR-LH', latitude: 6.9933, longitude: 3.9075, radiusMeters: 65 },
  { name: 'Agriculture Lab Block', tag: 'AGR-LAB', latitude: 6.9936, longitude: 3.9079, radiusMeters: 55 },

  // ── General Studies ────────────────────────────────────────
  { name: 'Main Auditorium', tag: 'MAIN-AUD', latitude: 6.9878, longitude: 3.9018, radiusMeters: 100 },
  { name: 'Postgraduate Hall', tag: 'PG-HALL', latitude: 6.9870, longitude: 3.9005, radiusMeters: 70 },
  { name: 'Senate Building Annexe', tag: 'SENATE-ANN', latitude: 6.9866, longitude: 3.9000, radiusMeters: 60 },
  { name: 'ICT Centre', tag: 'ICT', latitude: 6.9893, longitude: 3.9038, radiusMeters: 55 },
  { name: 'University Library Hall', tag: 'LIB-HALL', latitude: 6.9880, longitude: 3.9022, radiusMeters: 60 },
  { name: 'Distance Learning Centre', tag: 'DLC', latitude: 6.9848, longitude: 3.8975, radiusMeters: 70 },
];

const Building = sequelize.define(
  'Building',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    tag: { type: DataTypes.STRING(60), allowNull: true },
    college: { type: DataTypes.STRING(120), allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    radiusMeters: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 70,
      // OOU policy: max 120m, min 30m
      validate: { min: 30, max: 120 },
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: 'buildings', timestamps: true }
);

Building.seedOOU = async () => {
  for (const b of OOU_BUILDINGS) {
    await Building.findOrCreate({ where: { tag: b.tag }, defaults: { ...b, isActive: true } });
  }
  console.log(`OOU buildings seeded: ${OOU_BUILDINGS.length} locations`);
};

module.exports = Building;
