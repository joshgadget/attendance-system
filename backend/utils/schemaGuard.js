const { DataTypes } = require('sequelize');

const ensureColumn = async (queryInterface, tableName, columnName, definition) => {
  const columns = await queryInterface.describeTable(tableName);
  if (columns[columnName]) {
    return false;
  }

  await queryInterface.addColumn(tableName, columnName, definition);
  return true;
};

const ensureNullable = async (queryInterface, tableName, columnName) => {
  const columns = await queryInterface.describeTable(tableName);
  const col = columns[columnName];
  if (!col || col.allowNull !== false) {
    return false;
  }

  await queryInterface.changeColumn(tableName, columnName, {
    type: col.type,
    allowNull: true,
  });
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

  const buildingColumns = [
    ['campus', { type: DataTypes.STRING(120), allowNull: true }],
    ['geofenceToleranceMeters', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 }],
    ['polygonCoordinates', { type: DataTypes.TEXT, allowNull: true }],
  ];

  for (const [columnName, definition] of buildingColumns) {
    if (await ensureColumn(queryInterface, 'buildings', columnName, definition)) {
      appliedChanges.push(`buildings.${columnName}`);
    }
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

  const absenceQueryColumns = [
    ['queryEvidenceFileName', { type: DataTypes.STRING(255), allowNull: true }],
    ['queryEvidenceMimeType', { type: DataTypes.STRING(100), allowNull: true }],
    ['queryEvidenceData', { type: DataTypes.TEXT('long'), allowNull: true }],
    ['queryEvidenceNote', { type: DataTypes.TEXT, allowNull: true }],
    ['responseEvidenceFileName', { type: DataTypes.STRING(255), allowNull: true }],
    ['responseEvidenceMimeType', { type: DataTypes.STRING(100), allowNull: true }],
    ['responseEvidenceData', { type: DataTypes.TEXT('long'), allowNull: true }],
    ['responseEvidenceNote', { type: DataTypes.TEXT, allowNull: true }],
    ['escalationState', { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'none' }],
    ['escalatedAt', { type: DataTypes.DATE, allowNull: true }],
    ['escalatedByUserId', { type: DataTypes.INTEGER, allowNull: true }],
    ['escalationReason', { type: DataTypes.TEXT, allowNull: true }],
    ['adminResolution', { type: DataTypes.TEXT, allowNull: true }],
    ['adminResolvedAt', { type: DataTypes.DATE, allowNull: true }],
  ];

  for (const [columnName, definition] of absenceQueryColumns) {
    if (await ensureColumn(queryInterface, 'absence_queries', columnName, definition)) {
      appliedChanges.push(`absence_queries.${columnName}`);
    }
  }

  const sessionColumns = [
    ['lecturerLatitude', { type: DataTypes.DECIMAL(10, 7), allowNull: true }],
    ['lecturerLongitude', { type: DataTypes.DECIMAL(10, 7), allowNull: true }],
    ['lecturerLocationAccuracy', { type: DataTypes.FLOAT, allowNull: true }],
    ['sessionKey', { type: DataTypes.STRING(10), allowNull: true }],
    ['qrToken', { type: DataTypes.TEXT, allowNull: true }],
    ['expiresAt', { type: DataTypes.DATE, allowNull: true }],
    ['attendanceRadiusMeters', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 35 }],
  ];

  for (const [columnName, definition] of sessionColumns) {
    if (await ensureColumn(queryInterface, 'sessions', columnName, definition)) {
      appliedChanges.push(`sessions.${columnName}`);
    }
  }

  if (await ensureNullable(queryInterface, 'sessions', 'sessionCode')) {
    appliedChanges.push('sessions.sessionCode \u2192 allowNull: true');
  }

  if (await ensureIndex(queryInterface, 'sessions', 'sessions_session_key_unique', {
    unique: true,
    fields: ['sessionKey'],
  })) {
    appliedChanges.push('sessions(sessionKey) unique index');
  }

  if (await ensureIndex(queryInterface, 'attendance', 'attendance_session_student_unique', {
    unique: true,
    fields: ['sessionId', 'studentId'],
  })) {
    appliedChanges.push('attendance(sessionId, studentId) unique index');
  }

  const newTableColumns = {
    trusted_devices: [
      ['userId', { type: DataTypes.INTEGER, allowNull: false }],
      ['deviceLabel', { type: DataTypes.STRING(200), allowNull: true }],
      ['deviceFingerprint', { type: DataTypes.STRING(128), allowNull: false }],
      ['credentialId', { type: DataTypes.STRING(255), allowNull: true }],
      ['publicKey', { type: DataTypes.TEXT, allowNull: true }],
      ['status', { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' }],
      ['lastUsedAt', { type: DataTypes.DATE, allowNull: true }],
      ['revokedAt', { type: DataTypes.DATE, allowNull: true }],
    ],
    attendance_qr_challenges: [
      ['sessionId', { type: DataTypes.INTEGER, allowNull: false }],
      ['nonce', { type: DataTypes.STRING(64), allowNull: false }],
      ['issuedAt', { type: DataTypes.DATE, allowNull: false }],
      ['expiresAt', { type: DataTypes.DATE, allowNull: false }],
      ['usedAt', { type: DataTypes.DATE, allowNull: true }],
      ['usedByUserId', { type: DataTypes.INTEGER, allowNull: true }],
      ['signatureHash', { type: DataTypes.STRING(128), allowNull: false }],
    ],
    attendance_risk_events: [
      ['attendanceAttemptId', { type: DataTypes.INTEGER, allowNull: true }],
      ['studentId', { type: DataTypes.INTEGER, allowNull: false }],
      ['sessionId', { type: DataTypes.INTEGER, allowNull: false }],
      ['trustedDeviceId', { type: DataTypes.INTEGER, allowNull: true }],
      ['ipAddress', { type: DataTypes.STRING(120), allowNull: true }],
      ['riskScore', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['riskFlags', { type: DataTypes.TEXT, allowNull: true }],
      ['action', { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'allow' }],
      ['reviewedByUserId', { type: DataTypes.INTEGER, allowNull: true }],
      ['reviewNote', { type: DataTypes.TEXT, allowNull: true }],
      ['reviewedAt', { type: DataTypes.DATE, allowNull: true }],
    ],
  };

  for (const [tableName, columns] of Object.entries(newTableColumns)) {
    const tableExists = await queryInterface.tableExists(tableName);
    if (!tableExists) {
      const columnDefs = {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        ...Object.fromEntries(columns),
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      };
      await queryInterface.createTable(tableName, columnDefs);
      appliedChanges.push(`${tableName} (new table)`);
    } else {
      for (const [columnName, definition] of columns) {
        if (await ensureColumn(queryInterface, tableName, columnName, definition)) {
          appliedChanges.push(`${tableName}.${columnName}`);
        }
      }
    }
  }

  // Add trustedDeviceId to attendance_attempts AFTER trusted_devices table exists
  if (await ensureColumn(queryInterface, 'attendance_attempts', 'trustedDeviceId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  })) {
    appliedChanges.push('attendance_attempts.trustedDeviceId');
  }

  if (await ensureIndex(queryInterface, 'attendance', 'attendance_device_flagged_idx', {
    fields: ['deviceFlagged'],
  })) {
    appliedChanges.push('attendance(deviceFlagged) index');
  }

  return appliedChanges;
};

module.exports = { ensureSchemaGuard };
