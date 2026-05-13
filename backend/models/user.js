const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');
const authConfig = require('../config/auth');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'first_name' // Maps to database column first_name
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'last_name'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('student', 'lecturer', 'admin'),
    allowNull: false,
    defaultValue: 'student'
  },
  matricNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    field: 'matric_number'
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  faculty: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  program: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  campus: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  profilePhoto: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'profile_photo'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login'
  },
  resetPasswordToken: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'reset_password_token'
  },
  resetPasswordExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reset_password_expires'
  },
  mustResetPassword: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'must_reset_password'
  },
  failedLoginAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'failed_login_attempts'
  },
  lockedUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'locked_until'
  },
  lastKnownDeviceHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'last_known_device_hash'
  },
  lastKnownIp: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'last_known_ip'
  }
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true, // This automatically converts camelCase to snake_case for DB columns
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(authConfig.bcrypt.saltRounds);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(authConfig.bcrypt.saltRounds);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Instance method to check password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.isLocked = function() {
  return Boolean(this.lockedUntil && new Date(this.lockedUntil) > new Date());
};

User.prototype.recordFailedLogin = async function() {
  this.failedLoginAttempts = Number(this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= 5) {
    this.lockedUntil = new Date(Date.now() + (30 * 60 * 1000));
  }
  await this.save();
};

User.prototype.clearFailedLogins = async function() {
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  await this.save();
};

// Method to return user data without password
User.prototype.toSafeObject = function() {
  const { id, firstName, lastName, email, role, matricNumber, department, faculty, program, campus, profilePhoto, isActive, lastLogin, mustResetPassword, failedLoginAttempts, lockedUntil, createdAt, updatedAt } = this.toJSON();
  return { id, firstName, lastName, email, role, matricNumber, department, faculty, program, campus, profilePhoto, isActive, lastLogin, mustResetPassword, failedLoginAttempts, lockedUntil, createdAt, updatedAt };
};

module.exports = User;
