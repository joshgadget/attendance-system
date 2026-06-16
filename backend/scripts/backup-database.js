const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  sequelize,
  setupAssociations,
  User,
  StudentRegistry,
  Course,
  CourseAudience,
  CourseSchedule,
  Enrollment,
  Session,
  Attendance,
  AbsenceQuery,
  Building,
  AuditLog,
  SiteSetting,
} = require('../models');

const backupModels = [
  ['users', User],
  ['student_registry', StudentRegistry],
  ['courses', Course],
  ['course_audiences', CourseAudience],
  ['course_schedules', CourseSchedule],
  ['enrollments', Enrollment],
  ['sessions', Session],
  ['attendance', Attendance],
  ['absence_queries', AbsenceQuery],
  ['buildings', Building],
  ['audit_logs', AuditLog],
  ['site_settings', SiteSetting],
];

const createBackup = async () => {
  setupAssociations();
  await sequelize.authenticate();

  const backup = {
    generatedAt: new Date().toISOString(),
    database: process.env.DB_NAME || null,
    tables: {},
  };

  for (const [name, model] of backupModels) {
    const rows = await model.findAll({ raw: true });
    backup.tables[name] = rows;
  }

  const outputDir = path.resolve(__dirname, '..', '..', 'exports', 'backups');
  fs.mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `attendance-backup-${stamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written to ${outputPath}`);
};

createBackup()
  .catch((error) => {
    console.error('Backup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
