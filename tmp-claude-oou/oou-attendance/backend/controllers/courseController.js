const { Op } = require('sequelize');
const { Course, CourseSchedule, Enrollment, User, StudentRegistry } = require('../models');

const normalizeDayOfWeek = (value = '') => {
  const normalized = String(value).trim().toLowerCase();
  const map = {
    mon: 'monday',
    monday: 'monday',
    tue: 'tuesday',
    tues: 'tuesday',
    tuesday: 'tuesday',
    wed: 'wednesday',
    wednesday: 'wednesday',
    thu: 'thursday',
    thur: 'thursday',
    thurs: 'thursday',
    thursday: 'thursday',
    fri: 'friday',
    friday: 'friday',
    sat: 'saturday',
    saturday: 'saturday',
    sun: 'sunday',
    sunday: 'sunday',
  };

  return map[normalized] || '';
};

const normalizeTime = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }

  return '';
};

const courseInclude = [
  { model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department'] },
  { model: CourseSchedule, as: 'schedules', where: { isActive: true }, required: false, order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']] },
];

const findLecturer = async ({ lecturerId, lecturerEmail }) => {
  if (lecturerId) {
    const lecturer = await User.findByPk(Number(lecturerId));
    if (lecturer?.role === 'lecturer') {
      return lecturer;
    }
  }

  if (lecturerEmail) {
    const lecturer = await User.findOne({ where: { email: String(lecturerEmail).trim().toLowerCase(), role: 'lecturer', isActive: true } });
    if (lecturer) {
      return lecturer;
    }
  }

  return null;
};

exports.createCourse = async (req, res) => {
  try {
    const { courseCode, courseName, description, semester, academicYear, lecturerId, faculty, department, program, level } = req.body;

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
      faculty: faculty || null,
      department: department || null,
      program: program || null,
      level: level || null,
      isActive: true,
    });

    const created = await Course.findByPk(course.id, { include: courseInclude });
    res.status(201).json({ success: true, message: 'Course created successfully', data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpsertCourses = async (req, res) => {
  try {
    const { courses } = req.body;

    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({ success: false, message: 'courses must be a non-empty array' });
    }

    const results = [];

    for (const entry of courses) {
      const courseCode = String(entry.courseCode || '').trim().toUpperCase();
      const courseName = String(entry.courseName || '').trim();
      const semester = String(entry.semester || '').trim().toLowerCase();
      const academicYear = String(entry.academicYear || '').trim();

      if (!courseCode || !courseName || !semester || !academicYear) {
        return res.status(400).json({
          success: false,
          message: 'Each course must include courseCode, courseName, semester and academicYear',
        });
      }

      if (!['rain', 'harmattan'].includes(semester)) {
        return res.status(400).json({ success: false, message: `Invalid semester for ${courseCode}` });
      }

      const lecturer = await findLecturer({ lecturerId: entry.lecturerId, lecturerEmail: entry.lecturerEmail });
      if (!lecturer) {
        return res.status(400).json({ success: false, message: `Assigned lecturer not found for ${courseCode}` });
      }

      const [course, created] = await Course.findOrCreate({
        where: { courseCode },
        defaults: {
          courseCode,
          courseName,
          description: entry.description || null,
          semester,
          academicYear,
          lecturerId: lecturer.id,
          faculty: entry.faculty || null,
          department: entry.department || null,
          program: entry.program || null,
          level: entry.level || null,
          isActive: true,
        },
      });

      if (!created) {
        await course.update({
          courseName,
          description: entry.description || null,
          semester,
          academicYear,
          lecturerId: lecturer.id,
          faculty: entry.faculty || null,
          department: entry.department || null,
          program: entry.program || null,
          level: entry.level || null,
          isActive: true,
        });
      }

      results.push({ courseCode, action: created ? 'created' : 'updated', courseId: course.id });
    }

    res.json({ success: true, message: 'Course catalog imported successfully', data: { count: results.length, results } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpsertSchedules = async (req, res) => {
  try {
    const { schedules } = req.body;

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({ success: false, message: 'schedules must be a non-empty array' });
    }

    const results = [];

    for (const entry of schedules) {
      const courseCode = String(entry.courseCode || '').trim().toUpperCase();
      const dayOfWeek = normalizeDayOfWeek(entry.dayOfWeek);
      const startTime = normalizeTime(entry.startTime);
      const endTime = normalizeTime(entry.endTime);

      if (!courseCode || !dayOfWeek || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: 'Each schedule must include courseCode, dayOfWeek, startTime and endTime',
        });
      }

      const course = await Course.findOne({ where: { courseCode, isActive: true } });
      if (!course) {
        return res.status(400).json({ success: false, message: `Course not found for schedule entry: ${courseCode}` });
      }

      const [schedule, created] = await CourseSchedule.findOrCreate({
        where: {
          courseId: course.id,
          dayOfWeek,
          startTime,
          venue: entry.venue || null,
        },
        defaults: {
          courseId: course.id,
          dayOfWeek,
          startTime,
          endTime,
          venue: entry.venue || null,
          notifyMinutesBefore: Number(entry.notifyMinutesBefore || 30),
          isActive: true,
        },
      });

      if (!created) {
        await schedule.update({
          endTime,
          venue: entry.venue || null,
          notifyMinutesBefore: Number(entry.notifyMinutesBefore || 30),
          isActive: true,
        });
      }

      results.push({ courseCode, scheduleId: schedule.id, action: created ? 'created' : 'updated' });
    }

    res.json({ success: true, message: 'Timetable imported successfully', data: { count: results.length, results } });
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
      include: courseInclude,
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
      include: courseInclude,
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
            include: courseInclude,
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

    const where = req.user.role === 'lecturer'
      ? { lecturerId: req.user.id, isActive: true }
      : { isActive: true };

    const courses = await Course.findAll({
      where,
      include: courseInclude,
      order: [['createdAt', 'DESC']],
    });

    return res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCourseSchedules = async (req, res) => {
  try {
    const where = { isActive: true };

    if (req.query.courseId) {
      where.courseId = Number(req.query.courseId);
    }

    const include = [{
      model: Course,
      as: 'course',
      attributes: ['id', 'courseCode', 'courseName', 'lecturerId', 'faculty', 'department', 'program', 'level', 'semester', 'academicYear'],
    }];

    const schedules = await CourseSchedule.findAll({
      where,
      include,
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']],
    });

    const filtered = req.user.role === 'lecturer'
      ? schedules.filter((entry) => entry.course?.lecturerId === req.user.id)
      : req.user.role === 'student'
        ? schedules.filter(() => false)
        : schedules;

    res.json({ success: true, data: filtered });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkEnrollStudentsForCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'lecturer' && course.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to enroll students for this course' });
    }

    const { students, semester, academicYear } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'students must be a non-empty array' });
    }

    const resolvedSemester = String(semester || course.semester || '').trim().toLowerCase();
    const resolvedAcademicYear = String(academicYear || course.academicYear || '').trim();

    if (!resolvedSemester || !resolvedAcademicYear) {
      return res.status(400).json({ success: false, message: 'semester and academicYear are required' });
    }

    const results = [];
    const missing = [];

    for (const entry of students) {
      const matricNumber = String(entry.matricNumber || entry.matric || '').trim().toUpperCase();
      const email = String(entry.email || '').trim().toLowerCase();

      let student = null;
      if (matricNumber) {
        student = await User.findOne({ where: { role: 'student', matricNumber, isActive: true } });
      }

      if (!student && email) {
        student = await User.findOne({ where: { role: 'student', email, isActive: true } });
      }

      if (!student && matricNumber) {
        const registryRecord = await StudentRegistry.findOne({ where: { matricNumber, isActive: true } });
        if (registryRecord?.claimedByUserId) {
          student = await User.findByPk(registryRecord.claimedByUserId);
        }
      }

      if (!student || student.role !== 'student' || !student.isActive) {
        missing.push(matricNumber || email || 'Unknown student');
        continue;
      }

      const [enrollment, created] = await Enrollment.findOrCreate({
        where: {
          userId: student.id,
          courseId: course.id,
          semester: resolvedSemester,
          academicYear: resolvedAcademicYear,
        },
        defaults: {
          userId: student.id,
          courseId: course.id,
          semester: resolvedSemester,
          academicYear: resolvedAcademicYear,
          status: 'active',
        },
      });

      if (!created && enrollment.status !== 'active') {
        await enrollment.update({ status: 'active' });
      }

      results.push({
        studentId: student.id,
        matricNumber: student.matricNumber,
        email: student.email,
        action: created ? 'enrolled' : 'kept',
      });
    }

    res.json({
      success: true,
      message: 'Student roster processed successfully',
      data: {
        count: results.length,
        missing,
        results,
      },
    });
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
      include: courseInclude,
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

    await CourseSchedule.update({ isActive: false }, { where: { courseId: course.id } });

    res.json({ success: true, message: 'Course archived successfully', data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
