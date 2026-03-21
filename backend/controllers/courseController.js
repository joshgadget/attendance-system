const { Op } = require('sequelize');
const { Course, Enrollment, User } = require('../models');

exports.createCourse = async (req, res) => {
  try {
    const { courseCode, courseName, description, semester, academicYear, lecturerId } = req.body;

    if (!courseCode || !courseName || !semester || !academicYear || !lecturerId) {
      return res.status(400).json({
        success: false,
        message: 'courseCode, courseName, semester, academicYear and lecturerId are required',
      });
    }

    const lecturer = await User.findByPk(lecturerId);
    if (!lecturer || lecturer.role !== 'lecturer') {
      return res.status(404).json({ success: false, message: 'Assigned lecturer not found' });
    }

    const existing = await Course.findOne({ where: { courseCode } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Course code already exists' });
    }

    const course = await Course.create({
      courseCode,
      courseName,
      description,
      semester,
      academicYear,
      lecturerId,
      isActive: true,
    });

    res.status(201).json({ success: true, message: 'Course created successfully', data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCourses = async (req, res) => {
  try {
    const { search, activeOnly } = req.query;
    const where = {};

    if (req.user.role === 'lecturer') {
      where.lecturerId = req.user.id;
    }

    if (activeOnly === 'true') {
      where.isActive = true;
    }

    if (search) {
      where[Op.or] = [
        { courseCode: { [Op.like]: `%${search}%` } },
        { courseName: { [Op.like]: `%${search}%` } },
        { academicYear: { [Op.like]: `%${search}%` } },
      ];
    }

    const courses = await Course.findAll({
      where,
      include: [{ model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: [{ model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'lecturer' && course.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this course' });
    }

    res.json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyCourses = async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const enrollments = await Enrollment.findAll({
        where: { userId: req.user.id, status: 'active' },
        include: [
          {
            model: Course,
            as: 'course',
            include: [{ model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      return res.json({
        success: true,
        data: enrollments.map((entry) => ({
          ...entry.course.toJSON(),
          enrollment: {
            id: entry.id,
            semester: entry.semester,
            academicYear: entry.academicYear,
            status: entry.status,
          },
        })),
      });
    }

    const courses = await Course.findAll({
      where: { lecturerId: req.user.id, isActive: true },
      include: [{ model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const payload = { ...req.body };
    if (payload.lecturerId) {
      const lecturer = await User.findByPk(payload.lecturerId);
      if (!lecturer || lecturer.role !== 'lecturer') {
        return res.status(404).json({ success: false, message: 'Assigned lecturer not found' });
      }
    }

    await course.update(payload);

    const updatedCourse = await Course.findByPk(course.id, {
      include: [{ model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] }],
    });

    res.json({ success: true, message: 'Course updated successfully', data: updatedCourse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deactivateCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    course.isActive = false;
    await course.save();

    res.json({ success: true, message: 'Course archived successfully', data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
