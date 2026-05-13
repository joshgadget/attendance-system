const { Op } = require('sequelize');
const { User, Course, Enrollment, StudentRegistry, Session, AbsenceQuery, Attendance, CourseAudience, CourseSchedule } = require('../models');

const sanitizeUser = (user) => (typeof user.toSafeObject === 'function' ? user.toSafeObject() : user);
const MAX_PROFILE_PHOTO_LENGTH = 1_500_000;

const sanitizeProfilePhotoInput = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized.startsWith('data:image/')) {
    const error = new Error('Profile photo must be a valid image.');
    error.statusCode = 400;
    throw error;
  }

  if (normalized.length > MAX_PROFILE_PHOTO_LENGTH) {
    const error = new Error('Profile photo is too large. Choose a smaller image.');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
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

const getLecturerCourseIds = async (lecturerId) => {
  const lecturerCourses = await Course.findAll({
    where: { lecturerId, isActive: true },
    attributes: ['id'],
  });

  return lecturerCourses.map((course) => course.id);
};

const getLecturerStudentIds = async (lecturerId) => {
  const courseIds = await getLecturerCourseIds(lecturerId);
  if (courseIds.length === 0) {
    return [];
  }

  const enrollments = await Enrollment.findAll({
    where: {
      courseId: { [Op.in]: courseIds },
      status: 'active',
    },
    attributes: ['userId'],
  });

  return [...new Set(enrollments.map((entry) => entry.userId).filter(Boolean))];
};

exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [
        { model: StudentRegistry, as: 'registryRecord', required: false },
        { model: Enrollment, as: 'enrollments', required: false, include: [{ model: Course, as: 'course', required: false }] },
      ],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const allowedFields = ['firstName', 'lastName', 'department', 'faculty', 'program', 'profilePhoto'];
    const payload = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        payload[field] = field === 'profilePhoto'
          ? sanitizeProfilePhotoInput(req.body[field])
          : (req.body[field] || null);
      }
    });

    await user.update(payload);
    res.json({ success: true, message: 'Profile updated successfully', data: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyCourseOptions = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can manage personal course selections' });
    }

    const { semester = 'rain', academicYear } = req.query;
    const normalizedAcademicYear = normalizeAcademicYearInput(academicYear);

    if (!normalizedAcademicYear) {
      return res.status(400).json({ success: false, message: 'academicYear is required' });
    }

    const student = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [
        { model: StudentRegistry, as: 'registryRecord', required: false },
        {
          model: Enrollment,
          as: 'enrollments',
          required: false,
          where: { status: 'active', semester, academicYear: normalizedAcademicYear },
          include: [{ model: Course, as: 'course', required: false }],
        },
      ],
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (!student.registryRecord) {
      return res.status(400).json({ success: false, message: 'Your account is not linked to an active student registry record yet.' });
    }

    const courses = await Course.findAll({
      where: { isActive: true, semester },
      include: [
        { model: CourseAudience, as: 'audiences', where: { isActive: true }, required: false },
        { model: CourseSchedule, as: 'schedules', where: { isActive: true }, required: false },
        { model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'department'], required: false },
      ],
      order: [['courseCode', 'ASC']],
    });

    const filteredCourses = courses.filter((course) => courseMatchesRegistry(course, student.registryRecord, semester, normalizedAcademicYear));
    const selectedCourseIds = (student.enrollments || []).map((entry) => entry.courseId);

    res.json({
      success: true,
      data: {
        semester,
        academicYear: normalizedAcademicYear,
        student: sanitizeUser(student),
        registryRecord: student.registryRecord,
        selectedCourseIds,
        courses: filteredCourses,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMyEnrollments = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can update personal course selections' });
    }

    const { courseIds, semester, academicYear } = req.body;
    const normalizedAcademicYear = normalizeAcademicYearInput(academicYear);

    if (!Array.isArray(courseIds)) {
      return res.status(400).json({ success: false, message: 'courseIds must be an array' });
    }

    if (!semester || !normalizedAcademicYear) {
      return res.status(400).json({ success: false, message: 'semester and academicYear are required' });
    }

    const student = await User.findByPk(req.user.id, {
      include: [{ model: StudentRegistry, as: 'registryRecord', required: false }],
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (!student.registryRecord) {
      return res.status(400).json({ success: false, message: 'Your account is not linked to an active student registry record yet.' });
    }

    const allowedCourses = await Course.findAll({
      where: { isActive: true, semester },
      include: [{ model: CourseAudience, as: 'audiences', where: { isActive: true }, required: false }],
      order: [['courseCode', 'ASC']],
    });

    const allowedCourseIds = allowedCourses
      .filter((course) => courseMatchesRegistry(course, student.registryRecord, semester, normalizedAcademicYear))
      .map((course) => course.id);

    const uniqueCourseIds = [...new Set(courseIds.map(Number))].filter(Boolean);
    const invalidCourseIds = uniqueCourseIds.filter((courseId) => !allowedCourseIds.includes(courseId));

    if (invalidCourseIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected courses do not match your approved department, program, level, or semester timetable.',
      });
    }

    await Enrollment.destroy({
      where: { userId: student.id, semester, academicYear: normalizedAcademicYear },
    });

    if (uniqueCourseIds.length > 0) {
      await Enrollment.bulkCreate(
        uniqueCourseIds.map((courseId) => ({
          userId: student.id,
          courseId,
          semester,
          academicYear: normalizedAcademicYear,
          status: 'active',
        })),
        { ignoreDuplicates: true }
      );
    }

    res.json({
      success: true,
      message: 'Your course selections were updated successfully.',
      data: {
        semester,
        academicYear: normalizedAcademicYear,
        courseIds: uniqueCourseIds,
        level: student.registryRecord.level || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    const where = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { matricNumber: { [Op.like]: `%${search}%` } },
        { department: { [Op.like]: `%${search}%` } },
        { campus: { [Op.like]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Course, as: 'courses', required: false }],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentEnrollments = async (req, res) => {
  try {
    const student = await User.findByPk(req.params.id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const enrollments = await Enrollment.findAll({
      where: { userId: student.id },
      include: [{ model: Course, as: 'course' }],
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: enrollments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStudentEnrollments = async (req, res) => {
  try {
    const student = await User.findByPk(req.params.id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const { courseIds, semester, academicYear } = req.body;

    if (!Array.isArray(courseIds)) {
      return res.status(400).json({ success: false, message: 'courseIds must be an array' });
    }

    if (!semester || !academicYear) {
      return res.status(400).json({ success: false, message: 'semester and academicYear are required' });
    }

    await Enrollment.destroy({
      where: { userId: student.id, semester, academicYear },
    });

    const uniqueCourseIds = [...new Set(courseIds.map(Number))].filter(Boolean);
    const courses = await Course.findAll({ where: { id: uniqueCourseIds, isActive: true } });

    if (courses.length !== uniqueCourseIds.length) {
      return res.status(400).json({ success: false, message: 'One or more selected courses are invalid' });
    }

    await Enrollment.bulkCreate(
      uniqueCourseIds.map((courseId) => ({
        userId: student.id,
        courseId,
        semester,
        academicYear,
        status: 'active',
      })),
      { ignoreDuplicates: true }
    );

    res.json({ success: true, message: 'Student enrollments updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const payload = { ...req.body };
    delete payload.password;
    delete payload.email;

    await user.update(payload);
    res.json({ success: true, message: 'User updated', data: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deactivateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isActive = false;
    await user.save();

    res.json({ success: true, message: 'User deactivated', data: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reactivateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { tempPassword } = req.body;
    if (!tempPassword || String(tempPassword).length < 8) {
      return res.status(400).json({ success: false, message: 'tempPassword (min 8 chars) is required' });
    }

    user.password = tempPassword;
    user.isActive = true;
    user.mustResetPassword = true;
    await user.save();

    res.json({ success: true, message: 'User reactivated with temporary password', data: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getLecturers = async (req, res) => {
  try {
    const lecturers = await User.findAll({
      where: { role: 'lecturer', isActive: true },
      attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'campus'],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
    });

    res.json({ success: true, data: lecturers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const where = { role: 'student', isActive: true };

    if (req.user.role === 'lecturer') {
      const lecturerStudentIds = await getLecturerStudentIds(req.user.id);
      if (lecturerStudentIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      where.id = { [Op.in]: lecturerStudentIds };
    }

    const students = await User.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'matricNumber', 'department', 'faculty', 'program', 'campus'],
      include: [{ model: StudentRegistry, as: 'registryRecord', required: false, attributes: ['id', 'level', 'program', 'department', 'faculty', 'campus'] }],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
    });

    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSystemSummary = async (req, res) => {
  try {
    const [totalUsers, totalLecturers, totalStudents, totalCourses, totalRegistryRecords, claimedRegistryRecords, totalEnrollments, activeSessions, pendingQueries, attendanceMarks] = await Promise.all([
      User.count(),
      User.count({ where: { role: 'lecturer', isActive: true } }),
      User.count({ where: { role: 'student', isActive: true } }),
      Course.count({ where: { isActive: true } }),
      StudentRegistry.count({ where: { isActive: true } }),
      StudentRegistry.count({ where: { isActive: true, claimedByUserId: { [Op.ne]: null } } }),
      Enrollment.count({ where: { status: 'active' } }),
      Session.count({ where: { status: 'active' } }),
      AbsenceQuery.count({ where: { status: 'pending' } }),
      Attendance.count(),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalLecturers,
        totalStudents,
        totalCourses,
        totalRegistryRecords,
        claimedRegistryRecords,
        totalEnrollments,
        activeSessions,
        pendingQueries,
        attendanceMarks,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
