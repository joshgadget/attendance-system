const { Op } = require('sequelize');
const { User, Course, Enrollment, StudentRegistry, Session, AbsenceQuery, Attendance } = require('../models');

const sanitizeUser = (user) => (typeof user.toSafeObject === 'function' ? user.toSafeObject() : user);

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

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ success: false, message: 'courseIds must be a non-empty array' });
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

exports.getLecturers = async (req, res) => {
  try {
    const lecturers = await User.findAll({
      where: { role: 'lecturer', isActive: true },
      attributes: ['id', 'firstName', 'lastName', 'email', 'department'],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
    });

    res.json({ success: true, data: lecturers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: 'student', isActive: true },
      attributes: ['id', 'firstName', 'lastName', 'email', 'matricNumber', 'department', 'faculty', 'program'],
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
