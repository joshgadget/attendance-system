/**
 * OOU Auth Controller
 * Handles registration, login, and password management for
 * Olabisi Onabanjo University Attendance Management System
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Enrollment, Course, StudentRegistry, User } = require('../models');
const authConfig = require('../config/auth');
const { sendEmail } = require('../utils/mailer');

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const buildName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Student';

const generateTokens = (user) => {
  const payload = { id: user.id, email: user.email, role: user.role };
  return {
    accessToken: jwt.sign(payload, authConfig.jwt.secret, { expiresIn: authConfig.jwt.expiresIn }),
    refreshToken: jwt.sign(payload, authConfig.jwt.refreshSecret, { expiresIn: authConfig.jwt.refreshExpiresIn }),
  };
};

const sendWelcomeEmail = async (user, extra = {}) => {
  if (!user?.email) return;
  const name = buildName(user);
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/login`;
  const lines = [
    extra.matricNumber ? `Matric Number: ${extra.matricNumber}` : null,
    extra.faculty ? `Faculty: ${extra.faculty}` : null,
    extra.department ? `Department: ${extra.department}` : null,
    extra.level ? `Level: ${extra.level}` : null,
  ].filter(Boolean);

  await sendEmail({
    to: user.email,
    subject: 'OOU Attendance System: Account Created',
    text: `Hello ${name},\n\nYour account on the Olabisi Onabanjo University Attendance Management System has been created.\n\n${lines.join('\n')}\n\nLogin: ${loginUrl}\n\nDo not share your password with anyone.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
        <div style="background:#1a237e;color:white;padding:20px;">
          <h2 style="margin:0;">Olabisi Onabanjo University</h2>
          <p style="margin:4px 0 0;opacity:0.8;">Attendance Management System</p>
        </div>
        <div style="padding:20px;">
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your student account has been created successfully.</p>
          ${lines.length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
          <p><a href="${loginUrl}" style="background:#1a237e;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Login Now</a></p>
          <p style="color:#666;font-size:12px;">Do not share your login credentials. OOU policy prohibits account sharing.</p>
        </div>
      </div>
    `,
  });
};

// ── Student Matric Lookup (for signup form prefill) ────────────────────────
exports.studentLookup = async (req, res) => {
  try {
    const matricNumber = (req.params.matricNumber || '').trim().toUpperCase();
    const record = await StudentRegistry.findOne({ where: { matricNumber, isActive: true } });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Matric number not found in OOU student registry. Contact the Academic Affairs office.',
      });
    }

    if (record.claimedByUserId) {
      return res.status(409).json({
        success: false,
        message: 'This matric number is already registered. If this is an error, contact ICT support.',
      });
    }

    return res.json({
      success: true,
      data: {
        matricNumber: record.matricNumber,
        firstName: record.firstName,
        lastName: record.lastName,
        otherName: record.otherName,
        faculty: record.faculty,
        department: record.department,
        program: record.program,
        level: record.level,
        admissionYear: record.admissionYear,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get publicly visible courses (for signup course selection) ─────────────
exports.getPublicCourses = async (req, res) => {
  try {
    const { semester, academicYear, faculty, department, level } = req.query;
    const where = { isActive: true };
    if (semester) where.semester = semester;
    if (academicYear) where.academicYear = academicYear;
    if (faculty) where.faculty = faculty;
    if (department) where.department = department;
    if (level) where.level = level;

    const courses = await Course.findAll({
      where,
      attributes: ['id', 'courseCode', 'courseName', 'creditUnits', 'semester', 'academicYear', 'level', 'department'],
      order: [['courseCode', 'ASC']],
    });

    return res.json({ success: true, data: courses });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Student Self-Signup (registry-verified) ────────────────────────────────
exports.studentSignup = async (req, res) => {
  try {
    const { matricNumber, email, password, semester, academicYear, courseIds } = req.body;

    if (!matricNumber || !email || !password || !semester || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'matricNumber, email, password, semester, and academicYear are all required.',
      });
    }

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one course to complete your registration.',
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const registryRecord = await StudentRegistry.findOne({
      where: { matricNumber: matricNumber.toUpperCase(), isActive: true },
    });

    if (!registryRecord) {
      return res.status(404).json({
        success: false,
        message: 'Matric number not found in OOU registry. Contact the Academic Affairs office.',
      });
    }

    if (registryRecord.claimedByUserId) {
      return res.status(409).json({
        success: false,
        message: 'This matric number has already been used to create an account.',
      });
    }

    if (await User.findOne({ where: { email: normalizeEmail(email) } })) {
      return res.status(400).json({ success: false, message: 'This email address is already registered.' });
    }

    const user = await User.create({
      email: normalizeEmail(email),
      password,
      firstName: registryRecord.firstName,
      lastName: registryRecord.lastName,
      role: 'student',
      matricNumber: registryRecord.matricNumber,
      faculty: registryRecord.faculty,
      department: registryRecord.department,
      program: registryRecord.program,
      level: registryRecord.level,
    });

    // Enrol student in selected courses
    const uniqueIds = [...new Set(courseIds.map(Number))].filter(Boolean);
    const courses = await Course.findAll({ where: { id: uniqueIds, isActive: true } });

    if (courses.length !== uniqueIds.length) {
      await user.destroy();
      return res.status(400).json({ success: false, message: 'One or more selected courses are invalid.' });
    }

    await Enrollment.bulkCreate(
      uniqueIds.map((courseId) => ({ userId: user.id, courseId, semester, academicYear, status: 'active' })),
      { ignoreDuplicates: true }
    );

    registryRecord.claimedByUserId = user.id;
    await registryRecord.save();

    sendWelcomeEmail(user, {
      matricNumber: registryRecord.matricNumber,
      faculty: registryRecord.faculty,
      department: registryRecord.department,
      level: registryRecord.level,
    }).catch((e) => console.warn('Welcome email failed:', e.message));

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Welcome to OOU Attendance System.',
      data: { user: user.toSafeObject(), tokens: generateTokens(user) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Login with account lockout enforcement ─────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ where: { email: normalizeEmail(email) } });

    // Do not reveal whether the email exists
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Account lockout check
    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: `Account locked due to repeated failed login attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Contact the ICT support desk.' });
    }

    const passwordOk = await user.comparePassword(password);
    if (!passwordOk) {
      await user.recordFailedLogin();
      const remaining = 5 - user.failedLoginAttempts;
      return res.status(401).json({
        success: false,
        message: remaining > 0
          ? `Invalid email or password. ${remaining} attempt(s) remaining before lockout.`
          : 'Account has been locked due to too many failed attempts.',
      });
    }

    await user.clearFailedLogins();
    user.lastLogin = new Date();
    user.lastKnownIp = req.ip;
    await user.save();

    return res.json({
      success: true,
      message: 'Login successful.',
      data: { user: user.toSafeObject(), tokens: generateTokens(user) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── Refresh Token ──────────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'refreshToken is required.' });
    const decoded = jwt.verify(token, authConfig.jwt.refreshSecret);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Invalid token.' });
    return res.json({ success: true, data: generateTokens(user) });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
};

exports.getMe = (req, res) => res.json({ success: true, data: req.user });
exports.logout = (req, res) => res.json({ success: true, message: 'Logged out successfully.' });

// ── Forgot Password ────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ where: { email: normalizeEmail(email), isActive: true } });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashToken(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetLink = `${base}/#/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendEmail({
      to: user.email,
      subject: 'OOU Attendance System: Password Reset',
      text: `You requested a password reset. Click this link within 1 hour:\n${resetLink}\nIf you did not request this, ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
          <div style="background:#1a237e;color:white;padding:20px;"><h2 style="margin:0;">OOU Password Reset</h2></div>
          <div style="padding:20px;">
            <p>Click the button below to reset your password. This link is valid for <strong>1 hour</strong>.</p>
            <p><a href="${resetLink}" style="background:#1a237e;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Reset Password</a></p>
            <p style="color:#999;font-size:12px;">If you did not request this, you can safely ignore this email.</p>
          </div>
        </div>
      `,
    });

    return res.json({ success: true, message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reset Password ─────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'token and password are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const user = await User.findOne({
      where: { resetPasswordToken: hashToken(token), isActive: true },
    });

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired.' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    return res.json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Change Password ────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!user.mustResetPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required.' });
      }
      if (!(await user.comparePassword(currentPassword))) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
    }

    user.password = newPassword;
    user.mustResetPassword = false;
    await user.save();

    return res.json({ success: true, message: 'Password changed successfully.', data: user.toSafeObject() });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Admin: Register staff (lecturers, HODs, deans, admins) ────────────────
exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, department, faculty, staffId } = req.body;

    const allowedRoles = ['lecturer', 'admin', 'hod', 'dean'];
    if (!email || !password || !firstName || !lastName || !role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `email, password, firstName, lastName, and role (${allowedRoles.join(', ')}) are required.`,
      });
    }

    if (await User.findOne({ where: { email: normalizeEmail(email) } })) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    const user = await User.create({
      email: normalizeEmail(email),
      password,
      firstName,
      lastName,
      role,
      department: department || null,
      faculty: faculty || null,
      staffId: staffId || null,
      mustResetPassword: true, // Staff must reset on first login
    });

    sendWelcomeEmail(user, { faculty, department }).catch((e) => console.warn('Email failed:', e.message));

    return res.status(201).json({
      success: true,
      message: 'Staff account created. They must reset their password on first login.',
      data: user.toSafeObject(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
