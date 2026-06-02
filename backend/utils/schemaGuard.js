const { DataTypes } = require('sequelize');

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    if (typeof table === 'string') {
      return table === tableName;
    }

    return table && table.tableName === tableName;
  });
};

const ensureColumn = async (queryInterface, tableName, columnName, definition) => {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const columns = await queryInterface.describeTable(tableName);
  if (columns[columnName]) {
    return false;
  }

  await queryInterface.addColumn(tableName, columnName, definition);
  return true;
};

const ensureIndex = async (queryInterface, tableName, indexName, definition) => {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some((index) => index.name === indexName);
  if (exists) {
    return false;
  }

  await queryInterface.addIndex(tableName, definition.fields, {
    ...definition,
    name: indexName,
  });
  return true;
};

const ensureSchemaGuard = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  const appliedChanges = [];

  if (await ensureColumn(queryInterface, 'users', 'profile_photo', {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  })) {
    appliedChanges.push('users.profile_photo');
  }

  if (await ensureColumn(queryInterface, 'users', 'campus', {
    type: DataTypes.STRING(120),
    allowNull: true,
  })) {
    appliedChanges.push('users.campus');
  }

  if (await ensureColumn(queryInterface, 'users', 'failed_login_attempts', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })) {
    appliedChanges.push('users.failed_login_attempts');
  }

  if (await ensureColumn(queryInterface, 'users', 'locked_until', {
    type: DataTypes.DATE,
    allowNull: true,
  })) {
    appliedChanges.push('users.locked_until');
  }

  if (await ensureColumn(queryInterface, 'users', 'last_known_device_hash', {
    type: DataTypes.STRING(64),
    allowNull: true,
  })) {
    appliedChanges.push('users.last_known_device_hash');
  }

  if (await ensureColumn(queryInterface, 'users', 'last_known_ip', {
    type: DataTypes.STRING(120),
    allowNull: true,
  })) {
    appliedChanges.push('users.last_known_ip');
  }

  if (await ensureColumn(queryInterface, 'courses', 'campus', {
    type: DataTypes.STRING(120),
    allowNull: true,
  })) {
    appliedChanges.push('courses.campus');
  }

  if (await ensureColumn(queryInterface, 'buildings', 'campus', {
    type: DataTypes.STRING(120),
    allowNull: true,
  })) {
    appliedChanges.push('buildings.campus');
  }

  if (await ensureColumn(queryInterface, 'student_registry', 'campus', {
    type: DataTypes.STRING(120),
    allowNull: true,
  })) {
    appliedChanges.push('student_registry.campus');
  }

  if (await ensureColumn(queryInterface, 'course_audiences', 'campus', {
    type: DataTypes.STRING(120),
    allowNull: true,
  })) {
    appliedChanges.push('course_audiences.campus');
  }

  if (await ensureColumn(queryInterface, 'attendance', 'locationAccuracy', {
    type: DataTypes.FLOAT,
    allowNull: true,
  })) {
    appliedChanges.push('attendance.locationAccuracy');
  }

  if (await ensureColumn(queryInterface, 'attendance', 'distanceFromClass', {
    type: DataTypes.INTEGER,
    allowNull: true,
  })) {
    appliedChanges.push('attendance.distanceFromClass');
  }

  if (await ensureColumn(queryInterface, 'attendance', 'deviceFlagged', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })) {
    appliedChanges.push('attendance.deviceFlagged');
  }

  if (await ensureIndex(queryInterface, 'attendance', 'attendance_session_student_unique', {
    unique: true,
    fields: ['sessionId', 'studentId'],
  })) {
    appliedChanges.push('attendance(sessionId, studentId) unique index');
  }

  if (await ensureIndex(queryInterface, 'attendance', 'attendance_device_flagged_idx', {
    fields: ['deviceFlagged'],
  })) {
    appliedChanges.push('attendance(deviceFlagged) index');
  }

  return appliedChanges;
};

module.exports = { ensureSchemaGuard };
