const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Enrollment, Course, StudentRegistry, User } = require('../models');
const authConfig = require('../config/auth');
const { sendEmail } = require('../utils/mailer');

const generateTokens = (user) => {
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, authConfig.jwt.secret, { expiresIn: authConfig.jwt.expiresIn });
  const refreshToken = jwt.sign(payload, authConfig.jwt.refreshSecret, { expiresIn: authConfig.jwt.refreshExpiresIn });
  return { accessToken, refreshToken };
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createStudentEnrollments = async (userId, courseIds, semester, academicYear) => {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    return;
  }

  const uniqueCourseIds = [...new Set(courseIds.map(Number))].filter(Boolean);
  const courses = await Course.findAll({ where: { id: uniqueCourseIds, isActive: true } });

  if (courses.length !== uniqueCourseIds.length) {
    throw new Error('One or more selected courses are invalid');
  }

  await Enrollment.bulkCreate(
    uniqueCourseIds.map((courseId) => ({
      userId,
      courseId,
      semester,
      academicYear,
      status: 'active',
    })),
    { ignoreDuplicates: true }
  );
};

const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, department, faculty, program, matricNumber } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({
        success: false,
        message: 'email, password, firstName, lastName and role are required',
      });
    }

    if (!Object.values(authConfig.roles).includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role supplied' });
    }

    if (role === authConfig.roles.STUDENT && !matricNumber) {
      return res.status(400).json({ success: false, message: 'matricNumber is required for student accounts' });
    }

    const existing = await User.findOne({ where: { email: normalizeEmail(email) } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const user = await User.create({
      email: normalizeEmail(email),
      password,
      firstName,
      lastName,
      role,
      department,
      faculty: faculty || null,
      program: program || null,
      matricNumber: matricNumber || null,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: user.toSafeObject(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const studentLookup = async (req, res) => {
  try {
    const matricNumber = (req.params.matricNumber || '').trim();
    const record = await StudentRegistry.findOne({ where: { matricNumber, isActive: true } });

    if (!record) {
      return res.status(404).json({ success: false, message: 'Matric number not found in school registry' });
    }

    if (record.claimedByUserId) {
      return res.status(409).json({ success: false, message: 'This matric number has already been used to sign up' });
    }

    res.json({
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPublicCourses = async (req, res) => {
  try {
    const { semester, academicYear, faculty, department, program, level } = req.query;
    const where = { isActive: true };

    if (semester) {
      where.semester = semester;
    }

    if (academicYear) {
      where.academicYear = academicYear;
    }

    if (faculty) {
      where.faculty = faculty;
    }

    if (department) {
      where.department = department;
    }

    if (program) {
      where.program = program;
    }

    if (level) {
      where.level = level;
    }

    const courses = await Course.findAll({
      where,
      attributes: ['id', 'courseCode', 'courseName', 'semester', 'academicYear'],
      order: [['courseCode', 'ASC']],
    });

    res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const studentSignup = async (req, res) => {
  try {
    const { matricNumber, email, password, semester, academicYear, courseIds } = req.body;

    if (!matricNumber || !email || !password || !semester || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'matricNumber, email, password, semester and academicYear are required',
      });
    }

    const registryRecord = await StudentRegistry.findOne({ where: { matricNumber, isActive: true } });
    if (!registryRecord) {
      return res.status(404).json({ success: false, message: 'Matric number not found in school registry' });
    }

    if (registryRecord.claimedByUserId) {
      return res.status(409).json({ success: false, message: 'This matric number has already been used to sign up' });
    }

    const existing = await User.findOne({ where: { email: normalizeEmail(email) } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const user = await User.create({
      email: normalizeEmail(email),
      password,
      firstName: registryRecord.firstName,
      lastName: registryRecord.lastName,
      role: authConfig.roles.STUDENT,
      matricNumber: registryRecord.matricNumber,
      department: registryRecord.department,
      faculty: registryRecord.faculty,
      program: registryRecord.program,
    });

    await createStudentEnrollments(user.id, courseIds, semester, academicYear);

    registryRecord.claimedByUserId = user.id;
    await registryRecord.save();

    res.status(201).json({
      success: true,
      message: 'Student signup successful',
      data: {
        user: user.toSafeObject(),
        tokens: generateTokens(user),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const user = await User.findOne({ where: { email: normalizeEmail(email) } });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated' });
    }

    user.lastLogin = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toSafeObject(),
        tokens: generateTokens(user),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'refreshToken is required' });
    }

    const decoded = jwt.verify(token, authConfig.jwt.refreshSecret);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    res.json({ success: true, data: generateTokens(user) });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

const getMe = async (req, res) => {
  res.json({ success: true, data: req.user });
};

const logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ where: { email: normalizeEmail(email), isActive: true } });
    if (!user) {
      return res.json({
        success: true,
        message: 'If this email exists, a reset link has been sent',
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashToken(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const resetLink = `${normalizedBaseUrl}/#/reset-password?token=${encodeURIComponent(rawToken)}`;

    console.log(`Preparing password reset email for ${user.email}`);

    await sendEmail({
      to: user.email,
      subject: 'Attendance System Password Reset',
      text: `You requested a password reset. Use this link within 1 hour: ${resetLink}`,
      html: `<p>You requested a password reset for <strong>Attendance System</strong>.</p><p>Use this link within 1 hour:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });

    console.log(`Password reset email sent successfully to ${user.email}`);

    return res.json({
      success: true,
      message: 'If this email exists, a reset link has been sent',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'token and password are required' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    const hashedToken = hashToken(token);
    const user = await User.findOne({
      where: {
        resetPasswordToken: hashedToken,
        isActive: true,
      },
    });

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'newPassword is required' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.mustResetPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'currentPassword is required' });
      }
      const matches = await user.comparePassword(currentPassword);
      if (!matches) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }

    user.password = newPassword;
    user.mustResetPassword = false;
    await user.save();

    return res.json({ success: true, message: 'Password updated successfully', data: user.toSafeObject() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  register,
  studentLookup,
  getPublicCourses,
  studentSignup,
  login,
  refreshToken,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
};
