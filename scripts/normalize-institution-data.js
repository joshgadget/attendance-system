const fs = require('fs');
const path = require('path');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
};

const customEnvFile = process.env.ENV_FILE;
if (customEnvFile) {
  loadEnvFile(path.resolve(customEnvFile));
}

loadEnvFile(path.resolve(__dirname, '../backend/.env'));
loadEnvFile(path.resolve(__dirname, '../.env'));

const { sequelize } = require('../backend/config/database');
const { setupAssociations, User, Course, StudentRegistry, Building, CourseAudience } = require('../backend/models');
const { normalizeInstitutionText, normalizeAcademicYear, normalizeLevel } = require('../backend/utils/institutionNormalizer');

const normalizeFields = (record, fieldMap) => {
  const payload = {};
  for (const [field, type] of Object.entries(fieldMap)) {
    if (!Object.prototype.hasOwnProperty.call(record.dataValues, field)) {
      continue;
    }

    const currentValue = record[field];
    const nextValue = type === 'academicYear'
      ? (normalizeAcademicYear(currentValue) || null)
      : type === 'level'
        ? (normalizeLevel(currentValue) || null)
        : (normalizeInstitutionText(currentValue, type) || null);

    if ((currentValue || null) !== nextValue) {
      payload[field] = nextValue;
    }
  }
  return payload;
};

const normalizeModel = async (label, model, fieldMap, where = {}) => {
  const records = await model.findAll({ where });
  let changed = 0;

  for (const record of records) {
    const payload = normalizeFields(record, fieldMap);
    if (Object.keys(payload).length > 0) {
      await record.update(payload);
      changed += 1;
    }
  }

  return { label, scanned: records.length, changed };
};

const run = async () => {
  try {
    setupAssociations();
    await sequelize.authenticate();

    const results = [];
    results.push(await normalizeModel('users', User, {
      faculty: 'faculty',
      department: 'department',
      program: 'program',
      campus: 'campus',
    }));
    results.push(await normalizeModel('courses', Course, {
      faculty: 'faculty',
      department: 'department',
      program: 'program',
      campus: 'campus',
      level: 'level',
      academicYear: 'academicYear',
    }));
    results.push(await normalizeModel('student_registry', StudentRegistry, {
      faculty: 'faculty',
      department: 'department',
      program: 'program',
      campus: 'campus',
      level: 'level',
    }));
    results.push(await normalizeModel('buildings', Building, {
      campus: 'campus',
    }));
    results.push(await normalizeModel('course_audiences', CourseAudience, {
      faculty: 'faculty',
      department: 'department',
      program: 'program',
      campus: 'campus',
      level: 'level',
    }));

    console.table(results);
    await sequelize.close();
  } catch (error) {
    console.error('Normalization script failed:', error);
    process.exitCode = 1;
  }
};

run();
