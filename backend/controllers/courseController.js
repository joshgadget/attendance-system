const { Op } = require('sequelize');
const { PDFParse } = require('pdf-parse');
const { Course, CourseSchedule, CourseAudience, Enrollment, User, StudentRegistry } = require('../models');
const { logAuditEvent } = require('../utils/auditLogger');
const { normalizeInstitutionText, normalizeInstitutionPayload, normalizeAcademicYear, normalizeLevel } = require('../utils/institutionNormalizer');
const { broadcastNotification, buildNotificationPayload } = require('../utils/realtimeNotifications');

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

const formatTimeLabel = (value = '') => String(value).slice(0, 5);

const dayMap = {
  MON: 'monday',
  TUE: 'tuesday',
  WED: 'wednesday',
  THUR: 'thursday',
  FRI: 'friday',
  SAT: 'saturday',
  SUN: 'sunday',
};

const courseCodePattern = /(?:OOU-)?([A-Z]{2,4})\s?(\d{3})(?:\s*-\s*PR|\s*PR)?(?:\((?:NEW|OLD)\))?/gi;

const normalizeText = (value = '', field = 'generic') => normalizeInstitutionText(value, field);
const normalizeUpper = (value = '') => normalizeText(value).toUpperCase();
const normalizeCampus = (value = '') => normalizeInstitutionText(value, 'campus');

const normalizeCourseCode = (value = '') => {
  const cleaned = normalizeUpper(value)
    .replace(/OOU-/g, '')
    .replace(/\((NEW|OLD)\)/g, '')
    .replace(/\s*-\s*PR\b/g, '')
    .replace(/\s*PR\b/g, '')
    .replace(/\bLAB\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
  const match = cleaned.match(/^([A-Z]{2,4})(\d{3})$/);
  if (!match) {
    return '';
  }

  return `${match[1]} ${match[2]}`;
};

const courseCodeKey = (value = '') => normalizeCourseCode(value).replace(/\s/g, '');

const deriveLevelFromCourseCode = (courseCode = '') => {
  const match = normalizeCourseCode(courseCode).match(/(\d{3})$/);
  if (!match) {
    return '';
  }

  return `${match[1][0]}00`;
};

const buildAcademicYear = (value = '') => normalizeAcademicYear(value);

const extractCourseCodes = (value = '') => {
  const found = new Set();
  const text = String(value || '').replace(/\r?\n/g, ' ');
  for (const match of text.matchAll(courseCodePattern)) {
    const normalized = normalizeCourseCode(`${match[1]} ${match[2]}`);
    if (normalized) {
      found.add(normalized);
    }
  }

  return [...found];
};

const parsePdfTimetableMetadata = (text = '') => {
  const facultyMatch = text.match(/FACULTY OF\s+([A-Z][A-Z\s&-]+)/i);
  const titleMatch = text.match(/TIMETABLE FOR\s+(\d{4})\s*-\s*(\d{4})\s+(RAIN|HARMATTAN)\s+SEMESTER/i);

  return {
    faculty: facultyMatch ? normalizeInstitutionText(facultyMatch[1], 'faculty') : '',
    academicYear: titleMatch ? `${titleMatch[1].slice(-2)}/${titleMatch[2].slice(-2)}` : '',
    semester: titleMatch ? String(titleMatch[3]).toLowerCase() : '',
  };
};

const parsePdfCourseOfferings = (text = '') => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const offeringsByDepartment = new Map();
  let currentDay = '';
  let currentDepartment = '';

  for (const line of lines) {
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) {
      continue;
    }

    if (/^distribution:/i.test(line)) {
      break;
    }

    const day = dayMap[normalizeUpper(line)];
    if (day) {
      currentDay = day;
      currentDepartment = '';
      continue;
    }

    if (!currentDay) {
      continue;
    }

    if (/^DAYS\/?$/i.test(line) || /^DEPT\b/i.test(line) || /^B R E A K$/i.test(line) || /^SPORTS$/i.test(line) || /^J U M A$/i.test(line)) {
      continue;
    }

    const departmentLead = line.match(/^([A-Z]{2,4})(?:\s+|$)(.*)$/);
    if (departmentLead && !/\d/.test(departmentLead[1]) && !dayMap[departmentLead[1]]) {
      currentDepartment = departmentLead[1];
      if (!offeringsByDepartment.has(currentDepartment)) {
        offeringsByDepartment.set(currentDepartment, []);
      }

      if (departmentLead[2]) {
        offeringsByDepartment.get(currentDepartment).push(departmentLead[2]);
      }
      continue;
    }

    if (currentDepartment) {
      offeringsByDepartment.get(currentDepartment).push(line);
    }
  }

  return [...offeringsByDepartment.entries()].map(([department, chunks]) => {
    const courseCodes = extractCourseCodes(chunks.join(' '));
    return {
      department,
      courseCodes,
      levels: [...new Set(courseCodes.map((code) => deriveLevelFromCourseCode(code)).filter(Boolean))].sort(),
    };
  }).filter((entry) => entry.courseCodes.length > 0);
};

const buildCourseLookup = async () => {
  const courses = await Course.findAll();
  const lookup = new Map();
  courses.forEach((course) => {
    const key = courseCodeKey(course.courseCode);
    if (key) {
      lookup.set(key, course);
    }
  });
  return lookup;
};

const upsertCourseAudience = async (courseId, audience = {}) => {
  const payload = {
    courseId,
    campus: normalizeCampus(audience.campus) || null,
    faculty: normalizeInstitutionText(audience.faculty, 'faculty') || null,
    department: normalizeInstitutionText(audience.department, 'department').toUpperCase() || null,
    program: normalizeInstitutionText(audience.program, 'program') || null,
    level: normalizeLevel(audience.level) || null,
    isActive: audience.isActive !== false,
  };

  if (!payload.department && !payload.program && !payload.level && !payload.faculty && !payload.campus) {
    return null;
  }

  const [record] = await CourseAudience.findOrCreate({
    where: {
      courseId: payload.courseId,
      campus: payload.campus,
      faculty: payload.faculty,
      department: payload.department,
      program: payload.program,
      level: payload.level,
    },
    defaults: payload,
  });

  if (!record.isActive && payload.isActive) {
    await record.update({ isActive: true });
  }

  return record;
};

const syncClaimedStudentEnrollments = async (courses = []) => {
  if (!courses.length) {
    return 0;
  }

  const registryRecords = await StudentRegistry.findAll({
    where: {
      isActive: true,
      claimedByUserId: { [Op.ne]: null },
    },
  });

  const rows = [];
  courses.forEach((course) => {
    const audiences = (course.audiences || []).filter((entry) => entry.isActive !== false);
    audiences.forEach((audience) => {
      registryRecords.forEach((record) => {
        if (audience.faculty && normalizeUpper(record.faculty) !== normalizeUpper(audience.faculty)) {
          return;
        }
        if (audience.campus && normalizeUpper(record.campus) !== normalizeUpper(audience.campus)) {
          return;
        }
        if (audience.department && normalizeUpper(record.department) !== normalizeUpper(audience.department)) {
          return;
        }
        if (audience.program && normalizeUpper(record.program) !== normalizeUpper(audience.program)) {
          return;
        }
        if (audience.level && normalizeLevel(record.level) !== normalizeLevel(audience.level)) {
          return;
        }

        rows.push({
          userId: record.claimedByUserId,
          courseId: course.id,
          semester: course.semester,
          academicYear: course.academicYear,
          status: 'active',
        });
      });
    });
  });

  if (!rows.length) {
    return 0;
  }

  const uniqueRows = [];
  const seen = new Set();
  rows.forEach((row) => {
    const key = `${row.userId}:${row.courseId}:${row.semester}:${row.academicYear}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    uniqueRows.push(row);
  });

  await Enrollment.bulkCreate(uniqueRows, { ignoreDuplicates: true });
  return uniqueRows.length;
};

const courseInclude = [
  { model: User, as: 'lecturer', attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'campus'] },
  { model: CourseSchedule, as: 'schedules', where: { isActive: true }, required: false, order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']] },
  { model: CourseAudience, as: 'audiences', where: { isActive: true }, required: false },
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

const resolveFallbackLecturer = async (preferredUserId) => {
  if (preferredUserId) {
    const preferredUser = await User.findByPk(Number(preferredUserId));
    if (preferredUser?.isActive && preferredUser.role === 'lecturer') {
      return preferredUser;
    }
  }

  const activeLecturer = await User.findOne({
    where: { role: 'lecturer', isActive: true },
    order: [['createdAt', 'ASC']],
  });
  if (activeLecturer) {
    return activeLecturer;
  }

  const activeAdmin = await User.findOne({
    where: { role: 'admin', isActive: true },
    order: [['createdAt', 'ASC']],
  });
  if (activeAdmin) {
    return activeAdmin;
  }

  return null;
};

const getCourseNotificationUserIds = async (courseId, lecturerId = null) => {
  const userIds = new Set();

  if (lecturerId) {
    userIds.add(Number(lecturerId));
  }

  const enrollments = await Enrollment.findAll({
    where: {
      courseId,
      status: 'active',
    },
    attributes: ['userId'],
  });

  enrollments.forEach((entry) => {
    if (entry.userId) {
      userIds.add(Number(entry.userId));
    }
  });

  return Array.from(userIds).filter(Boolean);
};

const emitTimetableChangeNotification = async ({
  req,
  course,
  title,
  description,
  entityType = 'course',
  entityId = null,
}) => {
  const io = req.app.get('io');
  if (!io || !course?.id) {
    return;
  }

  const userIds = await getCourseNotificationUserIds(course.id, course.lecturerId);
  if (!userIds.length) {
    return;
  }

  broadcastNotification(io, {
    userIds,
    notification: buildNotificationPayload({
      type: 'timetable.updated',
      title,
      description,
      tone: 'slate',
      linkTab: 'courses',
      entityType,
      entityId: entityId || course.id,
      meta: {
        courseId: course.id,
        courseCode: course.courseCode || null,
      },
    }),
  });
};

exports.createCourse = async (req, res) => {
  try {
    const { courseCode, courseName, description, semester, lecturerId } = req.body;
    const normalizedStructure = normalizeInstitutionPayload(req.body, {
      academicYear: 'academicYear',
      faculty: 'faculty',
      department: 'department',
      program: 'program',
      campus: 'campus',
      level: 'level',
    });
    const { academicYear, faculty, department, program, campus, level } = normalizedStructure;
    const normalizedAcademicYear = buildAcademicYear(academicYear);

    if (!courseCode || !courseName || !semester || !normalizedAcademicYear || !lecturerId) {
      return res.status(400).json({
        success: false,
        message: 'courseCode, courseName, semester, academicYear and lecturerId are required',
      });
    }

    const lecturer = await User.findByPk(lecturerId);
    if (!lecturer || lecturer.role !== 'lecturer') {
      return res.status(404).json({ success: false, message: 'Assigned lecturer not found' });
    }

    const normalizedCode = normalizeCourseCode(courseCode);
    const existing = await Course.findOne({ where: { courseCode: normalizedCode || courseCode } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Course code already exists' });
    }

    const course = await Course.create({
      courseCode: normalizedCode || courseCode,
      courseName,
      description: String(description || '').trim() || null,
      semester,
      academicYear: normalizedAcademicYear,
      lecturerId,
      campus: normalizeCampus(campus) || null,
      faculty: normalizeInstitutionText(faculty, 'faculty') || null,
      department: normalizeInstitutionText(department, 'department') || null,
      program: normalizeInstitutionText(program, 'program') || null,
      level: normalizeLevel(level) || null,
      isActive: true,
    });

    await upsertCourseAudience(course.id, { campus, faculty, department, program, level });
    await logAuditEvent({
      req,
      action: 'course.created',
      targetType: 'course',
      targetId: course.id,
      campus: course.campus,
      faculty: course.faculty,
      department: course.department,
      metadata: {
        courseCode: course.courseCode,
        semester: course.semester,
        academicYear: course.academicYear,
        lecturerId: course.lecturerId,
      },
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
    const existingCourseLookup = await buildCourseLookup();
    const fallbackLecturer = await resolveFallbackLecturer(req.user?.id);

    if (!fallbackLecturer) {
      return res.status(400).json({
        success: false,
        message: 'No active lecturer or admin account is available to own imported courses yet.',
      });
    }

    for (const entry of courses) {
      const courseCode = normalizeCourseCode(entry.courseCode || '');
      const courseName = String(entry.courseName || '').trim();
      const semester = String(entry.semester || '').trim().toLowerCase();
      const normalizedEntry = normalizeInstitutionPayload(entry, {
        academicYear: 'academicYear',
        faculty: 'faculty',
        department: 'department',
        program: 'program',
        campus: 'campus',
        level: 'level',
      });
      const academicYear = buildAcademicYear(normalizedEntry.academicYear || '');

      if (!courseCode || !courseName || !semester || !academicYear) {
        return res.status(400).json({
          success: false,
          message: 'Each course must include courseCode, courseName, semester and academicYear',
        });
      }

      if (!['rain', 'harmattan'].includes(semester)) {
        return res.status(400).json({ success: false, message: `Invalid semester for ${courseCode}` });
      }

      const lecturer = (entry.lecturerId || entry.lecturerEmail)
        ? await findLecturer({ lecturerId: entry.lecturerId, lecturerEmail: entry.lecturerEmail })
        : fallbackLecturer;
      if ((entry.lecturerId || entry.lecturerEmail) && !lecturer) {
        return res.status(400).json({ success: false, message: `Assigned lecturer not found for ${courseCode}` });
      }

      const lookupKey = courseCodeKey(courseCode);
      let course = existingCourseLookup.get(lookupKey) || null;
      let created = false;

      if (!course) {
        course = await Course.create({
          courseCode,
          courseName,
          description: String(entry.description || '').trim() || null,
          semester,
          academicYear,
          lecturerId: lecturer?.id || fallbackLecturer.id,
          campus: normalizeCampus(normalizedEntry.campus) || null,
          faculty: normalizedEntry.faculty || null,
          department: normalizeUpper(normalizedEntry.department) || null,
          program: normalizedEntry.program || null,
          level: normalizeLevel(normalizedEntry.level) || null,
          isActive: true,
        });
        existingCourseLookup.set(lookupKey, course);
        created = true;
      }

      if (!created) {
        await course.update({
          courseName,
          description: String(entry.description || '').trim() || null,
          semester,
          academicYear,
          lecturerId: lecturer?.id || course.lecturerId || fallbackLecturer.id,
          campus: normalizeCampus(normalizedEntry.campus) || null,
          faculty: normalizedEntry.faculty || null,
          department: normalizeUpper(normalizedEntry.department) || null,
          program: normalizedEntry.program || null,
          level: normalizeLevel(normalizedEntry.level) || null,
          isActive: true,
        });
      }

      await upsertCourseAudience(course.id, {
        campus: normalizedEntry.campus || null,
        faculty: normalizedEntry.faculty || null,
        department: normalizedEntry.department || null,
        program: normalizedEntry.program || null,
        level: normalizedEntry.level || null,
      });

      results.push({ courseCode, action: created ? 'created' : 'updated', courseId: course.id });
    }

    await logAuditEvent({
      req,
      action: 'course.catalog.bulk_upsert',
      targetType: 'course_catalog',
      targetId: 'bulk',
      metadata: { count: results.length },
    });

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
    const existingCourseLookup = await buildCourseLookup();

    for (const entry of schedules) {
      const courseCode = normalizeCourseCode(entry.courseCode || '');
      const dayOfWeek = normalizeDayOfWeek(entry.dayOfWeek);
      const startTime = normalizeTime(entry.startTime);
      const endTime = normalizeTime(entry.endTime);

      if (!courseCode || !dayOfWeek || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: 'Each schedule must include courseCode, dayOfWeek, startTime and endTime',
        });
      }

      const course = existingCourseLookup.get(courseCodeKey(courseCode)) || null;
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

exports.importTimetablePdf = async (req, res) => {
  try {
    const { fileName, base64Data, semester, academicYear, faculty, campus, autoAssignClaimedStudents = true } = req.body;

    if (!base64Data) {
      return res.status(400).json({ success: false, message: 'base64Data is required for timetable PDF import' });
    }

    const buffer = Buffer.from(String(base64Data).replace(/^data:application\/pdf;base64,/i, ''), 'base64');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    const metadata = parsePdfTimetableMetadata(result.text);
    const extractedSemester = String(semester || metadata.semester || '').toLowerCase();
    const extractedAcademicYear = buildAcademicYear(academicYear || metadata.academicYear || '');
    const extractedFaculty = normalizeText(faculty || metadata.faculty || '');
    const extractedCampus = normalizeCampus(campus);

    if (!extractedSemester || !extractedAcademicYear) {
      return res.status(400).json({
        success: false,
        message: 'The timetable PDF could not provide semester and academic year clearly. Supply them manually and try again.',
      });
    }

    const departmentOfferings = parsePdfCourseOfferings(result.text);
    if (!departmentOfferings.length) {
      return res.status(400).json({
        success: false,
        message: 'No department course offerings could be extracted from this timetable PDF.',
      });
    }

    const existingCourseLookup = await buildCourseLookup();
    const fallbackLecturer = await resolveFallbackLecturer(req.user?.id);
    if (!fallbackLecturer) {
      return res.status(400).json({
        success: false,
        message: 'No active lecturer or admin account is available to own timetable-imported courses yet.',
      });
    }
    const touchedCourseIds = new Set();
    const touchedDepartments = [];
    let audienceCount = 0;

    for (const offering of departmentOfferings) {
      touchedDepartments.push({
        department: offering.department,
        courseCount: offering.courseCodes.length,
        levels: offering.levels,
      });

      for (const courseCode of offering.courseCodes) {
        const lookupKey = courseCodeKey(courseCode);
        let course = existingCourseLookup.get(lookupKey) || null;
        const level = deriveLevelFromCourseCode(courseCode);

        if (!course) {
          course = await Course.create({
            courseCode,
            courseName: courseCode,
            description: `Imported from timetable PDF${fileName ? ` (${fileName})` : ''}`,
            semester: extractedSemester,
            academicYear: extractedAcademicYear,
            lecturerId: fallbackLecturer.id,
            campus: extractedCampus || null,
            faculty: extractedFaculty || null,
            department: null,
            program: null,
            level: null,
            isActive: true,
          });
          existingCourseLookup.set(lookupKey, course);
        } else {
          await course.update({
            semester: extractedSemester,
            academicYear: extractedAcademicYear,
            lecturerId: course.lecturerId || fallbackLecturer.id,
            campus: course.campus || extractedCampus || null,
            faculty: course.faculty || extractedFaculty || null,
            isActive: true,
          });
        }

        touchedCourseIds.add(course.id);
        const audience = await upsertCourseAudience(course.id, {
          campus: extractedCampus || null,
          faculty: extractedFaculty || null,
          department: offering.department,
          level,
        });
        if (audience) {
          audienceCount += 1;
        }
      }
    }

    const touchedCourses = await Course.findAll({
      where: { id: [...touchedCourseIds] },
      include: courseInclude,
    });

    const syncedEnrollments = autoAssignClaimedStudents ? await syncClaimedStudentEnrollments(touchedCourses) : 0;

    await logAuditEvent({
      req,
      action: 'course.timetable.imported',
      targetType: 'timetable_pdf',
      targetId: fileName || 'pdf-import',
      campus: extractedCampus || null,
      faculty: extractedFaculty || null,
      metadata: {
        semester: extractedSemester,
        academicYear: extractedAcademicYear,
        courseCount: touchedCourses.length,
        audienceCount,
        syncedEnrollments,
      },
    });

    res.json({
      success: true,
      message: 'Timetable PDF imported successfully',
      data: {
        fileName: fileName || null,
        semester: extractedSemester,
        academicYear: extractedAcademicYear,
        campus: extractedCampus || null,
        faculty: extractedFaculty || null,
        departments: touchedDepartments,
        courseCount: touchedCourses.length,
        audienceCount,
        syncedEnrollments,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCourses = async (req, res) => {
  try {
    const { search, activeOnly, campus } = req.query;
    const where = {};

    if (req.user.role === 'lecturer') {
      where.lecturerId = req.user.id;
    }

    if (activeOnly === 'true') {
      where.isActive = true;
    }

    if (campus) {
      where.campus = campus;
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
      attributes: ['id', 'courseCode', 'courseName', 'lecturerId', 'campus', 'faculty', 'department', 'program', 'level', 'semester', 'academicYear'],
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

exports.removeCourseSchedule = async (req, res) => {
  try {
    const schedule = await CourseSchedule.findByPk(req.params.scheduleId, {
      include: [{
        model: Course,
        as: 'course',
        attributes: ['id', 'courseCode', 'courseName', 'lecturerId', 'campus', 'faculty', 'department'],
      }],
    });

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    }

    if (!schedule.isActive) {
      return res.json({
        success: true,
        message: 'Timetable entry was already removed.',
        data: schedule,
      });
    }

    schedule.isActive = false;
    await schedule.save();

    await logAuditEvent({
      req,
      action: 'course.schedule.removed',
      targetType: 'course_schedule',
      targetId: schedule.id,
      campus: schedule.course?.campus || null,
      faculty: schedule.course?.faculty || null,
      department: schedule.course?.department || null,
      metadata: {
        courseId: schedule.courseId,
        courseCode: schedule.course?.courseCode || null,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        venue: schedule.venue || null,
      },
    });

    await emitTimetableChangeNotification({
      req,
      course: schedule.course,
      title: `Timetable updated for ${schedule.course?.courseCode || 'a course'}`,
      description: `${schedule.course?.courseCode || 'This course'} will no longer send reminders for ${schedule.dayOfWeek} at ${formatTimeLabel(schedule.startTime)}${schedule.venue ? ` in ${schedule.venue}` : ''}.`,
      entityType: 'course_schedule',
      entityId: schedule.id,
    });

    res.json({
      success: true,
      message: 'Timetable entry removed successfully. Class reminders for that slot will stop automatically.',
      data: schedule,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.clearCourseSchedules = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      attributes: ['id', 'courseCode', 'courseName', 'lecturerId', 'campus', 'faculty', 'department'],
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const activeSchedules = await CourseSchedule.findAll({
      where: {
        courseId: course.id,
        isActive: true,
      },
      attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'venue'],
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']],
    });

    if (activeSchedules.length === 0) {
      return res.json({
        success: true,
        message: 'This course does not have any active timetable entries to remove.',
        data: {
          courseId: course.id,
          removedCount: 0,
        },
      });
    }

    await CourseSchedule.update(
      { isActive: false },
      {
        where: {
          courseId: course.id,
          isActive: true,
        },
      }
    );

    await logAuditEvent({
      req,
      action: 'course.schedule.bulk_removed',
      targetType: 'course',
      targetId: course.id,
      campus: course.campus,
      faculty: course.faculty,
      department: course.department,
      metadata: {
        courseCode: course.courseCode,
        removedCount: activeSchedules.length,
      },
    });

    await emitTimetableChangeNotification({
      req,
      course,
      title: `Timetable removed for ${course.courseCode || 'a course'}`,
      description: `${course.courseCode || 'This course'} no longer has active timetable slots, so future class reminders have stopped.`,
      entityType: 'course',
      entityId: course.id,
    });

    res.json({
      success: true,
      message: 'Course timetable removed successfully. Future class reminders for this course will stop automatically.',
      data: {
        courseId: course.id,
        removedCount: activeSchedules.length,
        schedules: activeSchedules,
      },
    });
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
    const resolvedAcademicYear = buildAcademicYear(academicYear || course.academicYear || '');

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

    const payload = {
      ...req.body,
      ...normalizeInstitutionPayload(req.body, {
        academicYear: 'academicYear',
        faculty: 'faculty',
        department: 'department',
        program: 'program',
        campus: 'campus',
        level: 'level',
      }),
    };
    if (payload.academicYear) {
      payload.academicYear = buildAcademicYear(payload.academicYear);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'campus')) {
      payload.campus = normalizeCampus(payload.campus) || null;
    }
    if (payload.lecturerId) {
      const lecturer = await User.findByPk(payload.lecturerId);
      if (!lecturer || lecturer.role !== 'lecturer') {
        return res.status(404).json({ success: false, message: 'Assigned lecturer not found' });
      }
    }

    await course.update(payload);
    await upsertCourseAudience(course.id, {
      campus: payload.campus ?? course.campus,
      faculty: payload.faculty ?? course.faculty,
      department: payload.department ?? course.department,
      program: payload.program ?? course.program,
      level: payload.level ?? course.level,
    });
    await logAuditEvent({
      req,
      action: 'course.updated',
      targetType: 'course',
      targetId: course.id,
      campus: course.campus,
      faculty: course.faculty,
      department: course.department,
      metadata: {
        changedFields: Object.keys(payload),
      },
    });

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
    await CourseAudience.update({ isActive: false }, { where: { courseId: course.id } });
    await logAuditEvent({
      req,
      action: 'course.archived',
      targetType: 'course',
      targetId: course.id,
      campus: course.campus,
      faculty: course.faculty,
      department: course.department,
      metadata: { courseCode: course.courseCode },
    });

    res.json({ success: true, message: 'Course archived successfully', data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
