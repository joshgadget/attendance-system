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
