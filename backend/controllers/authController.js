const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Enrollment, Course, CourseAudience, StudentRegistry, User } = require('../models');
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
const buildDisplayName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'there';
const normalizeCampus = (value = '') => String(value || '').trim();

const sendWelcomeEmail = async (user, context = {}) => {
  if (!user?.email) {
    return;
  }

  const name = buildDisplayName(user);
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const loginUrl = normalizedBaseUrl.includes('/#') ? normalizedBaseUrl : `${normalizedBaseUrl}/#/login`;
  const summaryLines = [
    context.matricNumber ? `Matric number: ${context.matricNumber}` : null,
    context.department ? `Department: ${context.department}` : null,
    context.faculty ? `Faculty: ${context.faculty}` : null,
    context.program ? `Program: ${context.program}` : null,
    context.campus ? `Campus: ${context.campus}` : null,
  ].filter(Boolean);

  await sendEmail({
    to: user.email,
    subject: 'Welcome to Attendance System',
    text: `Hello ${name},\n\nWelcome to Attendance System. Your account has been created successfully.\n${summaryLines.length ? `\n${summaryLines.join('\n')}\n` : '\n'}\nYou can sign in here: ${loginUrl}\n\nIf you did not create this account, please contact your administrator immediately.`,
    html: `<p>Hello ${name},</p><p>Welcome to <strong>Attendance System</strong>. Your account has been created successfully.</p>${summaryLines.length ? `<p>${summaryLines.map((line) => line.replace(': ', ':</strong> ').replace(/^([^:]+):/, '<strong>$1:')).join('<br />')}</p>` : ''}<p>You can sign in here:</p><p style="word-break: break-all;"><a href="${loginUrl}">${loginUrl}</a></p><p>If you did not create this account, please contact your administrator immediately.</p>`,
  });
};

const createStudentEnrollments = async (userId, courseIds, semester, academicYear) => {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    return;
  }

  const resolvedAcademicYear = normalizeAcademicYearInput(academicYear);
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
      academicYear: resolvedAcademicYear,
      status: 'active',
    })),
    { ignoreDuplicates: true }
  );
};

const normalizeLevel = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 1) {
    return `${digits}00`;
  }

  if (digits.length >= 3) {
    return `${digits[0]}00`;
  }

  return digits;
};

const normalizeAcademicYearInput = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const fourDigitYears = raw.match(/\d{4}/g);
  if (fourDigitYears && fourDigitYears.length >= 2) {
    return `${fourDigitYears[0].slice(-2)}/${fourDigitYears[1].slice(-2)}`;
  }

  const twoDigitYears = raw.match(/\d{2}/g);
  if (twoDigitYears && twoDigitYears.length >= 2) {
    return `${twoDigitYears[0]}/${twoDigitYears[1]}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
  }

  return raw;
};

const buildAcademicYearVariants = (value = '') => {
  const raw = String(value || '').trim();
  const normalized = normalizeAcademicYearInput(raw);
  if (!normalized) {
    return [];
  }

  const [startShort = '', endShort = ''] = normalized.split('/');
  const startLong = startShort.length === 2 ? `20${startShort}` : startShort;
  const endLong = endShort.length === 2 ? `20${endShort}` : endShort;

  return [...new Set([
    raw,
    normalized,
    `${startLong}/${endLong}`,
    `${startLong}/${endShort}`,
    `${startShort}/${endLong}`,
  ].filter(Boolean))];
};

const ENTITY_STOP_WORDS = new Set(['OF', 'AND', 'THE', 'STUDIES', 'SCIENCES']);
const DEPARTMENT_ALIAS_MAP = {
  'MECHANICAL ENGINEERING': ['MEE', 'MECH', 'ME'],
  'COMPUTER ENGINEERING': ['CPE', 'COE'],
  'ELECTRICAL ELECTRONICS ENGINEERING': ['EEE', 'ELE', 'ELECTRICALENGINEERING'],
  'ELECTRICAL/ELECTRONICS ENGINEERING': ['EEE', 'ELE', 'ELECTRICALENGINEERING'],
  'CIVIL ENGINEERING': ['CVE', 'CEE', 'CE'],
  'AGRICULTURAL ENGINEERING': ['AGE', 'AGEE', 'AE'],
  'CHEMICAL ENGINEERING': ['CHE', 'CHEE'],
};

const normalizeEntity = (value = '') => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const compressEntity = (value = '') => normalizeEntity(value).replace(/\s+/g, '');

const buildEntityVariants = (value = '', aliasMap = null) => {
  const normalized = normalizeEntity(value);
  if (!normalized) {
    return new Set();
  }

  const variants = new Set([normalized, compressEntity(normalized)]);
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    variants.add(tokens.map((token) => token[0]).join(''));
    variants.add(tokens.filter((token) => !ENTITY_STOP_WORDS.has(token)).map((token) => token[0]).join(''));
  }

  const aliasValues = aliasMap?.[normalized] || [];
  aliasValues.forEach((alias) => {
    const aliasNormalized = normalizeEntity(alias);
    if (!aliasNormalized) {
      return;
    }
    variants.add(aliasNormalized);
    variants.add(compressEntity(aliasNormalized));
  });

  return variants;
};

const entitiesMatch = (left = '', right = '', aliasMap = null) => {
  if (!left || !right) {
    return false;
  }

  const leftVariants = buildEntityVariants(left, aliasMap);
  const rightVariants = buildEntityVariants(right, aliasMap);
  for (const variant of leftVariants) {
    if (rightVariants.has(variant)) {
      return true;
    }
  }

  const leftCompressed = compressEntity(left);
  const rightCompressed = compressEntity(right);
  return leftCompressed.includes(rightCompressed) || rightCompressed.includes(leftCompressed);
};

const audienceMatchesRegistry = (audience, registryRecord) => {
  if (!audience) {
    return false;
  }

  if (audience.campus && registryRecord?.campus && !entitiesMatch(audience.campus, registryRecord.campus)) {
    return false;
  }

  if (audience.faculty && registryRecord?.faculty && !entitiesMatch(audience.faculty, registryRecord.faculty)) {
    return false;
  }

  if (audience.department && registryRecord?.department && !entitiesMatch(audience.department, registryRecord.department, DEPARTMENT_ALIAS_MAP)) {
    return false;
  }

  if (audience.program && registryRecord?.program && !entitiesMatch(audience.program, registryRecord.program, DEPARTMENT_ALIAS_MAP)) {
    return false;
  }

  if (audience.level && registryRecord?.level && normalizeLevel(audience.level) !== normalizeLevel(registryRecord.level)) {
    return false;
  }

  return true;
};

const courseMatchesRegistry = (course, registryRecord, semester, academicYear) => {
  if (semester && course.semester && course.semester !== semester) {
    return false;
  }

  if (academicYear && normalizeAcademicYearInput(course.academicYear) !== normalizeAcademicYearInput(academicYear)) {
    return false;
  }

  const audiences = Array.isArray(course.audiences)
    ? course.audiences.filter((audience) => audience?.isActive !== false)
    : [];

  if (audiences.length > 0) {
    return audiences.some((audience) => audienceMatchesRegistry(audience, registryRecord));
  }

  return (
    (!course.campus || !registryRecord?.campus || entitiesMatch(course.campus, registryRecord.campus)) &&
    (!course.faculty || !registryRecord?.faculty || entitiesMatch(course.faculty, registryRecord.faculty)) &&
    (!course.department || !registryRecord?.department || entitiesMatch(course.department, registryRecord.department, DEPARTMENT_ALIAS_MAP)) &&
    (!course.program || !registryRecord?.program || entitiesMatch(course.program, registryRecord.program, DEPARTMENT_ALIAS_MAP)) &&
    (!course.level || !registryRecord?.level || normalizeLevel(course.level) === normalizeLevel(registryRecord.level))
  );
};

const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, department, faculty, program, campus, matricNumber } = req.body;

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
      campus: normalizeCampus(campus) || null,
      matricNumber: matricNumber || null,
    });

    try {
      await sendWelcomeEmail(user, {
        matricNumber,
        department,
        faculty,
        program,
        campus,
      });
    } catch (emailError) {
      console.warn(`Welcome email failed for ${user.email}:`, emailError.message);
    }

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
        campus: record.campus,
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
    const { semester, academicYear, faculty, department, program, campus, level } = req.query;
    const where = { isActive: true };

    if (semester) {
      where.semester = semester;
    }

    const courses = await Course.findAll({
      where,
      include: [{
        model: CourseAudience,
        as: 'audiences',
        where: { isActive: true },
        required: false,
      }],
      attributes: ['id', 'courseCode', 'courseName', 'semester', 'academicYear', 'campus', 'faculty', 'department', 'program', 'level'],
      order: [['courseCode', 'ASC']],
    });

    const normalizedRequestedYear = normalizeAcademicYearInput(academicYear);
    const filteredCourses = courses.filter((course) => courseMatchesRegistry(course, {
      faculty,
      department,
      program,
      campus,
      level,
    }, semester, normalizedRequestedYear));

    res.json({ success: true, data: filteredCourses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const studentSignup = async (req, res) => {
  try {
    const { matricNumber, email, password, semester, academicYear, courseIds } = req.body;
    const normalizedAcademicYear = normalizeAcademicYearInput(academicYear);

    if (!matricNumber || !email || !password || !semester || !normalizedAcademicYear) {
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

    let resolvedCourseIds = Array.isArray(courseIds) ? courseIds : [];
    if (resolvedCourseIds.length === 0) {
      const matchingCourses = await Course.findAll({
        where: {
          isActive: true,
          semester,
        },
        include: [{
          model: CourseAudience,
          as: 'audiences',
          required: false,
          where: { isActive: true },
        }],
        attributes: ['id', 'academicYear', 'faculty', 'department', 'program', 'level', 'semester'],
      });

      resolvedCourseIds = matchingCourses
        .filter((course) => courseMatchesRegistry(course, registryRecord, semester, normalizedAcademicYear))
        .map((course) => course.id);
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
      campus: registryRecord.campus,
    });

    await createStudentEnrollments(user.id, resolvedCourseIds, semester, normalizedAcademicYear);

    registryRecord.claimedByUserId = user.id;
    await registryRecord.save();

    try {
      await sendWelcomeEmail(user, {
        matricNumber: registryRecord.matricNumber,
        department: registryRecord.department,
        faculty: registryRecord.faculty,
        program: registryRecord.program,
        campus: registryRecord.campus,
      });
    } catch (emailError) {
      console.warn(`Welcome email failed for ${user.email}:`, emailError.message);
    }

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
    console.error('Login failed:', error);
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
      html: `<p>You requested a password reset for <strong>Attendance System</strong>.</p><p>Use this link within 1 hour:</p><p style="word-break: break-all; font-family: monospace;">${resetLink}</p><p>If clicking the link does not work, copy and paste it into your browser.</p><p>If you did not request this, you can ignore this email.</p>`,
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
