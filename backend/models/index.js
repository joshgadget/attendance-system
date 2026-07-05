const { sequelize } = require('../config/database');

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
const SiteSetting = require('./SiteSetting');
const ClassReminderLog = require('./ClassReminderLog');
const AttendanceAttempt = require('./AttendanceAttempt');
const TrustedDevice = require('./TrustedDevice');
const AttendanceQrChallenge = require('./AttendanceQrChallenge');
const AttendanceRiskEvent = require('./AttendanceRiskEvent');

const setupAssociations = () => {
  User.hasMany(Course, { foreignKey: 'lecturerId', as: 'courses' });
  Course.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer' });

  Course.hasMany(Session, { foreignKey: 'courseId', as: 'sessions' });
  Session.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  User.hasMany(Session, { foreignKey: 'lecturerId', as: 'lecturedSessions' });
  Session.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer' });

  Session.hasMany(Attendance, { foreignKey: 'sessionId', as: 'attendances' });
  Attendance.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  User.hasMany(Attendance, { foreignKey: 'studentId', as: 'attendances' });
  Attendance.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

  Course.hasMany(Attendance, { foreignKey: 'courseId', as: 'attendances' });
  Attendance.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  User.hasOne(StudentRegistry, { foreignKey: 'claimedByUserId', as: 'registryRecord' });
  StudentRegistry.belongsTo(User, { foreignKey: 'claimedByUserId', as: 'claimedBy' });

  User.hasMany(Enrollment, { foreignKey: 'userId', as: 'enrollments' });
  Enrollment.belongsTo(User, { foreignKey: 'userId', as: 'student' });

  Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments' });
  Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  Course.hasMany(CourseSchedule, { foreignKey: 'courseId', as: 'schedules' });
  CourseSchedule.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  Course.hasMany(CourseAudience, { foreignKey: 'courseId', as: 'audiences' });
  CourseAudience.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  CourseSchedule.hasMany(ClassReminderLog, { foreignKey: 'courseScheduleId', as: 'reminderLogs' });
  ClassReminderLog.belongsTo(CourseSchedule, { foreignKey: 'courseScheduleId', as: 'schedule' });

  Course.hasMany(ClassReminderLog, { foreignKey: 'courseId', as: 'reminderLogs' });
  ClassReminderLog.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  User.hasMany(ClassReminderLog, { foreignKey: 'userId', as: 'classReminderLogs' });
  ClassReminderLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(AbsenceQuery, { foreignKey: 'lecturerId', as: 'sentQueries' });
  AbsenceQuery.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer' });

  User.hasMany(AbsenceQuery, { foreignKey: 'studentId', as: 'receivedQueries' });
  AbsenceQuery.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

  User.hasMany(AbsenceQuery, { foreignKey: 'escalatedByUserId', as: 'escalatedQueries' });
  AbsenceQuery.belongsTo(User, { foreignKey: 'escalatedByUserId', as: 'escalatedBy' });

  Session.hasMany(AbsenceQuery, { foreignKey: 'sessionId', as: 'queries' });
  AbsenceQuery.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  User.hasMany(AuditLog, { foreignKey: 'actorId', as: 'auditLogs' });
  AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

  User.hasMany(SiteSetting, { foreignKey: 'updatedByUserId', as: 'updatedSiteSettings' });
  SiteSetting.belongsTo(User, { foreignKey: 'updatedByUserId', as: 'updatedBy' });

  User.hasMany(AttendanceAttempt, { foreignKey: 'studentId', as: 'attendanceAttempts' });
  AttendanceAttempt.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

  Session.hasMany(AttendanceAttempt, { foreignKey: 'sessionId', as: 'attempts' });
  AttendanceAttempt.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  Course.hasMany(AttendanceAttempt, { foreignKey: 'courseId', as: 'attempts' });
  AttendanceAttempt.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

  User.hasMany(TrustedDevice, { foreignKey: 'userId', as: 'trustedDevices' });
  TrustedDevice.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Session.hasMany(AttendanceQrChallenge, { foreignKey: 'sessionId', as: 'qrChallenges' });
  AttendanceQrChallenge.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  Session.hasMany(AttendanceRiskEvent, { foreignKey: 'sessionId', as: 'riskEvents' });
  AttendanceRiskEvent.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

  User.hasMany(AttendanceRiskEvent, { foreignKey: 'studentId', as: 'riskEvents' });
  AttendanceRiskEvent.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

  AttendanceAttempt.hasMany(AttendanceRiskEvent, { foreignKey: 'attendanceAttemptId', as: 'riskEvents' });
  AttendanceRiskEvent.belongsTo(AttendanceAttempt, { foreignKey: 'attendanceAttemptId', as: 'attendanceAttempt' });

  TrustedDevice.hasMany(AttendanceRiskEvent, { foreignKey: 'trustedDeviceId', as: 'riskEvents' });
  AttendanceRiskEvent.belongsTo(TrustedDevice, { foreignKey: 'trustedDeviceId', as: 'trustedDevice' });

  User.hasMany(AttendanceRiskEvent, { foreignKey: 'reviewedByUserId', as: 'reviewedRiskEvents' });
  AttendanceRiskEvent.belongsTo(User, { foreignKey: 'reviewedByUserId', as: 'reviewedBy' });

  AttendanceAttempt.belongsTo(TrustedDevice, { foreignKey: 'trustedDeviceId', as: 'trustedDevice' });
  TrustedDevice.hasMany(AttendanceAttempt, { foreignKey: 'trustedDeviceId', as: 'attempts' });
};

const syncDatabase = async () => {
  try {
    setupAssociations();
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
  ClassReminderLog,
  AuditLog,
  SiteSetting,
  AttendanceAttempt,
  TrustedDevice,
  AttendanceQrChallenge,
  AttendanceRiskEvent,
  setupAssociations,
  syncDatabase
};
