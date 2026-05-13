const { sequelize } = require('../config/database');

// Import models
const User = require('./user');
const Course = require('./course');
const Session = require('./Session');
const Attendance = require('./attendance');
const AbsenceQuery = require('./AbsenceQuery');
const StudentRegistry = require('./StudentRegistry');
const Enrollment = require('./Enrollment');
const Building = require('./Building');
const CourseSchedule = require('./CourseSchedule');
const CourseAudience = require('./CourseAudience');
const AuditLog = require('./AuditLog');

// Setup associations function
const setupAssociations = () => {
  // User (Lecturer) -> Course (One-to-Many)
  User.hasMany(Course, { foreignKey: 'lecturerId', as: 'courses' });
  Course.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer' });

  // Course -> Session (One-to-Many)
  Course.hasMany(Session, { foreignKey: 'courseId', as: 'sessions' });
  Session.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // User (Lecturer) -> Session (One-to-Many)
  User.hasMany(Session, { foreignKey: 'lecturerId', as: 'lecturedSessions' });
  Session.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer' });

  // Session -> Attendance (One-to-Many)
  Session.hasMany(Attendance, { foreignKey: 'sessionId', as: 'attendances' });
  Attendance.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  // User (Student) -> Attendance (One-to-Many)
  User.hasMany(Attendance, { foreignKey: 'studentId', as: 'attendances' });
  Attendance.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

  // Course -> Attendance (One-to-Many)
  Course.hasMany(Attendance, { foreignKey: 'courseId', as: 'attendances' });
  Attendance.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Student registry -> User
  User.hasOne(StudentRegistry, { foreignKey: 'claimedByUserId', as: 'registryRecord' });
  StudentRegistry.belongsTo(User, { foreignKey: 'claimedByUserId', as: 'claimedBy' });

  // User -> Enrollment
  User.hasMany(Enrollment, { foreignKey: 'userId', as: 'enrollments' });
  Enrollment.belongsTo(User, { foreignKey: 'userId', as: 'student' });

  // Course -> Enrollment
  Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments' });
  Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Course -> CourseSchedule
  Course.hasMany(CourseSchedule, { foreignKey: 'courseId', as: 'schedules' });
  CourseSchedule.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Course -> CourseAudience
  Course.hasMany(CourseAudience, { foreignKey: 'courseId', as: 'audiences' });
  CourseAudience.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  // Lecturer -> AbsenceQuery
  User.hasMany(AbsenceQuery, { foreignKey: 'lecturerId', as: 'sentQueries' });
  AbsenceQuery.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer' });

  // Student -> AbsenceQuery
  User.hasMany(AbsenceQuery, { foreignKey: 'studentId', as: 'receivedQueries' });
  AbsenceQuery.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

  // Session -> AbsenceQuery
  Session.hasMany(AbsenceQuery, { foreignKey: 'sessionId', as: 'queries' });
  AbsenceQuery.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  // User -> AuditLog
  User.hasMany(AuditLog, { foreignKey: 'actorId', as: 'auditLogs' });
  AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });
};

// Sync all models with database
const syncDatabase = async () => {
  try {
    setupAssociations(); // Call this before syncing
    await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Error synchronizing database:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Course,
  Session,
  Attendance,
  AbsenceQuery,
  StudentRegistry,
  Enrollment,
  Building,
  CourseSchedule,
  CourseAudience,
  AuditLog,
  setupAssociations,
  syncDatabase
};
