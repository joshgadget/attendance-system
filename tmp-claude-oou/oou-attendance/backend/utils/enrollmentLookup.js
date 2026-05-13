const { Enrollment, User } = require('../models');

const dedupeEnrollments = (entries) => {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.userId || seen.has(entry.userId)) {
      return false;
    }

    seen.add(entry.userId);
    return true;
  });
};

const findEnrollmentsForCourse = async (course, options = {}) => {
  if (!course?.id) {
    return [];
  }

  const include = options.includeStudent
    ? [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName', 'matricNumber', 'email', 'department', 'faculty', 'program', 'isActive'] }]
    : [];

  const exactMatches = await Enrollment.findAll({
    where: {
      courseId: course.id,
      semester: course.semester,
      academicYear: course.academicYear,
      status: 'active',
    },
    include,
    order: [['createdAt', 'ASC']],
  });

  if (exactMatches.length > 0) {
    return dedupeEnrollments(exactMatches).filter((entry) => (options.includeStudent ? entry.student?.isActive !== false : true));
  }

  const fallbackMatches = await Enrollment.findAll({
    where: {
      courseId: course.id,
      status: 'active',
    },
    include,
    order: [['createdAt', 'ASC']],
  });

  return dedupeEnrollments(fallbackMatches).filter((entry) => (options.includeStudent ? entry.student?.isActive !== false : true));
};

module.exports = {
  findEnrollmentsForCourse,
};
