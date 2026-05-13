const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

// OOU Faculties and Departments registry
const OOU_FACULTIES = {
  'College of Science and Education': [
    'Computer Science', 'Mathematics', 'Physics', 'Chemistry',
    'Biology', 'Biochemistry', 'Microbiology', 'Statistics',
    'Science Education', 'Mathematics Education',
  ],
  'College of Engineering': [
    'Civil Engineering', 'Electrical and Electronics Engineering',
    'Mechanical Engineering', 'Computer Engineering',
    'Chemical Engineering', 'Agricultural Engineering',
  ],
  'College of Management Sciences': [
    'Accounting', 'Banking and Finance', 'Business Administration',
    'Marketing', 'Insurance', 'Economics',
  ],
  'College of Social Sciences': [
    'Sociology', 'Political Science', 'Mass Communication',
    'Psychology', 'Geography', 'Public Administration',
  ],
  'College of Law': ['Law'],
  'College of Medicine': [
    'Medicine and Surgery', 'Nursing', 'Medical Laboratory Science',
    'Anatomy', 'Physiology', 'Pharmacology',
  ],
  'College of Agriculture': [
    'Animal Science', 'Crop Production', 'Fisheries',
    'Soil Science', 'Agricultural Economics', 'Food Science',
  ],
};

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  firstName: { type: DataTypes.STRING(100), allowNull: false, field: 'first_name' },
  lastName: { type: DataTypes.STRING(100), allowNull: false, field: 'last_name' },

  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },

  password: { type: DataTypes.STRING(255), allowNull: false },

  role: {
    type: DataTypes.ENUM('student', 'lecturer', 'admin', 'hod', 'dean'),
    allowNull: false,
    defaultValue: 'student',
  },

  matricNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    field: 'matric_number',
    // OOU matric format: OOU/YYYY/DEPT/NNNNN
    validate: {
      isOOUFormat(value) {
        if (value && !/^OOU\/\d{4}\/[A-Z]+\/\d{5}$/i.test(value)) {
          throw new Error('Matric number must follow OOU format: OOU/YYYY/DEPT/NNNNN');
        }
      },
    },
  },

  staffId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    field: 'staff_id',
  },

  faculty: { type: DataTypes.STRING(120), allowNull: true },
  department: { type: DataTypes.STRING(120), allowNull: true },
  program: { type: DataTypes.STRING(120), allowNull: true },

  level: {
    type: DataTypes.ENUM('100', '200', '300', '400', '500', '600', 'PG'),
    allowNull: true,
  },

  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  lastLogin: { type: DataTypes.DATE, allowNull: true, field: 'last_login' },

  // Security fields
  resetPasswordToken: { type: DataTypes.STRING(255), allowNull: true, field: 'reset_password_token' },
  resetPasswordExpires: { type: DataTypes.DATE, allowNull: true, field: 'reset_password_expires' },
  mustResetPassword: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'must_reset_password' },

  // Account lockout after repeated failed logins
  failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0, field: 'failed_login_attempts' },
  lockedUntil: { type: DataTypes.DATE, allowNull: true, field: 'locked_until' },

  // Device fingerprint for anti-proxy enforcement
  lastKnownDeviceHash: { type: DataTypes.STRING(64), allowNull: true, field: 'last_known_device_hash' },
  lastKnownIp: { type: DataTypes.STRING(45), allowNull: true, field: 'last_known_ip' },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(12); // Increased from 10 to 12 for OOU
        user.password = await bcrypt.hash(user.password, salt);
      }
      if (user.email) user.email = user.email.trim().toLowerCase();
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
      if (user.changed('email') && user.email) {
        user.email = user.email.trim().toLowerCase();
      }
    },
  },
});

User.prototype.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.isLocked = function () {
  return this.lockedUntil && this.lockedUntil > new Date();
};

User.prototype.recordFailedLogin = async function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    // Lock account for 30 minutes after 5 failures
    this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  await this.save();
};

User.prototype.clearFailedLogins = async function () {
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  await this.save();
};

User.prototype.toSafeObject = function () {
  const {
    id, firstName, lastName, email, role,
    matricNumber, staffId, faculty, department, program, level,
    isActive, lastLogin, mustResetPassword, createdAt, updatedAt,
  } = this.toJSON();
  return {
    id, firstName, lastName, email, role,
    matricNumber, staffId, faculty, department, program, level,
    isActive, lastLogin, mustResetPassword, createdAt, updatedAt,
  };
};

User.OOU_FACULTIES = OOU_FACULTIES;

module.exports = User;
