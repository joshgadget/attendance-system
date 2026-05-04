const { DataTypes } = require('sequelize');

const ensureColumn = async (queryInterface, tableName, columnName, definition) => {
  const columns = await queryInterface.describeTable(tableName);
  if (columns[columnName]) {
    return false;
  }

  await queryInterface.addColumn(tableName, columnName, definition);
  return true;
};

const ensureIndex = async (queryInterface, tableName, indexName, definition) => {
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

  if (await ensureIndex(queryInterface, 'attendance', 'attendance_session_student_unique', {
    unique: true,
    fields: ['sessionId', 'studentId'],
  })) {
    appliedChanges.push('attendance(sessionId, studentId) unique index');
  }

  return appliedChanges;
};

module.exports = { ensureSchemaGuard };
