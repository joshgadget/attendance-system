const { Op } = require('sequelize');
const { User, Course, Enrollment, Session, Attendance, AbsenceQuery, StudentRegistry, CourseSchedule, AuditLog } = require('../models');

const sortByDateDesc = (items, accessor) =>
  [...items].sort((left, right) => new Date(accessor(right)).getTime() - new Date(accessor(left)).getTime());

const formatCourseName = (course) => [course?.courseCode, course?.courseName].filter(Boolean).join(' - ');
const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayIndexMap = dayOrder.reduce((acc, day, index) => ({ ...acc, [day]: index }), {});

const getCurrentLagosParts = () => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  });

  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: String(parts.weekday || '').toLowerCase(),
  };
};

const minutesSinceMidnight = (time = '') => {
  const [hours = 0, minutes = 0] = String(time).split(':').map(Number);
  return (hours * 60) + minutes;
};

const getNextOccurrenceMinutes = (schedule, nowParts) => {
  const todayIndex = dayIndexMap[nowParts.weekday];
  const scheduleIndex = dayIndexMap[String(schedule.dayOfWeek || '').toLowerCase()];
  if (todayIndex === undefined || scheduleIndex === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  const nowMinutes = (nowParts.hour * 60) + nowParts.minute;
  const startMinutes = minutesSinceMidnight(schedule.startTime);
  let diffDays = scheduleIndex - todayIndex;

  if (diffDays < 0 || (diffDays === 0 && startMinutes < nowMinutes)) {
    diffDays += 7;
  }

  return (diffDays * 1440) + (startMinutes - nowMinutes);
};

const buildUpcomingScheduleNotifications = (enrollments = [], scope = 'student') => {
  const nowParts = getCurrentLagosParts();
  const upcoming = [];

  for (const enrollment of enrollments) {
    const course = enrollment.course || enrollment;
    const schedules = course?.schedules || [];
    for (const schedule of schedules) {
      const minutesUntil = getNextOccurrenceMinutes(schedule, nowParts);
      if (!Number.isFinite(minutesUntil) || minutesUntil < 0 || minutesUntil > 24 * 60) {
        continue;
      }

      const notifyBefore = Number(schedule.notifyMinutesBefore || 30);
      const title = scope === 'lecturer'
        ? `Upcoming class for ${course.courseCode || 'your course'}`
        : `Upcoming class: ${course.courseCode || 'Course'}`;
      const description = `${course.courseName || 'Scheduled class'} starts ${minutesUntil <= 0 ? 'now' : minutesUntil === 1 ? 'in 1 minute' : `in ${minutesUntil} minutes`} on ${schedule.dayOfWeek} at ${String(schedule.startTime).slice(0, 5)}${schedule.venue ? ` in ${schedule.venue}` : ''}.`;

      upcoming.push({
        title,
        description,
        tone: minutesUntil <= notifyBefore ? 'amber' : 'blue',
        createdAt: new Date(Date.now() - (minutesUntil * 60 * 1000)).toISOString(),
        priority: minutesUntil,
      });
    }
  }

  return upcoming.sort((left, right) => left.priority - right.priority).slice(0, 8);
};

const buildAdminAnalytics = async () => {
  const [users, courses, sessions, attendances, queries, registryRecords, enrollments, auditLogs] = await Promise.all([
    User.findAll({ attributes: ['id', 'role', 'isActive', 'createdAt'] }),
    Course.findAll({ attributes: ['id', 'courseCode', 'courseName', 'campus', 'faculty', 'department', 'isActive', 'createdAt'] }),
    Session.findAll({ attributes: ['id', 'courseId', 'status', 'createdAt', 'updatedAt'] }),
    Attendance.findAll({ attributes: ['id', 'courseId', 'status', 'markedAt', 'createdAt'] }),
    AbsenceQuery.findAll({ attributes: ['id', 'status', 'createdAt', 'respondedAt'] }),
    StudentRegistry.findAll({ attributes: ['id', 'campus', 'faculty', 'department', 'claimedByUserId', 'createdAt'] }),
    Enrollment.findAll({ attributes: ['id', 'courseId', 'createdAt'] }),
    AuditLog.findAll({ attributes: ['id', 'action', 'campus', 'department', 'createdAt'] }),
  ]);

  const attendanceBreakdown = ['present', 'late', 'absent', 'excused'].map((status) => ({
    label: status,
    value: attendances.filter((entry) => entry.status === status).length,
  }));

  const roleBreakdown = ['admin', 'lecturer', 'student'].map((role) => ({
    label: role,
    value: users.filter((entry) => entry.role === role && entry.isActive).length,
  }));

  const queryBreakdown = ['pending', 'responded', 'closed'].map((status) => ({
    label: status,
    value: queries.filter((entry) => entry.status === status).length,
  }));

  const campusBreakdown = [...new Set([...courses.map((entry) => entry.campus), ...registryRecords.map((entry) => entry.campus)].filter(Boolean))]
    .map((campus) => ({
      label: campus,
      value: courses.filter((entry) => entry.campus === campus && entry.isActive).length,
    }));

  const facultyBreakdown = [...new Set([...courses.map((entry) => entry.faculty), ...registryRecords.map((entry) => entry.faculty)].filter(Boolean))]
    .map((faculty) => ({
      label: faculty,
      value: courses.filter((entry) => entry.faculty === faculty && entry.isActive).length,
    }));

  const courseAnalytics = courses
    .filter((course) => course.isActive)
    .map((course) => {
      const courseSessions = sessions.filter((session) => session.courseId === course.id);
      const courseAttendances = attendances.filter((attendance) => attendance.courseId === course.id);
      const enrolledCount = enrollments.filter((enrollment) => enrollment.courseId === course.id).length;
      const presentCount = courseAttendances.filter((attendance) => attendance.status === 'present').length;
      const lateCount = courseAttendances.filter((attendance) => attendance.status === 'late').length;
      const absentCount = courseAttendances.filter((attendance) => attendance.status === 'absent').length;

      return {
        courseId: course.id,
        courseLabel: formatCourseName(course),
        sessionCount: courseSessions.length,
        enrolledCount,
        presentCount,
        lateCount,
        absentCount,
      };
    })
    .sort((left, right) => (right.sessionCount + right.enrolledCount) - (left.sessionCount + left.enrolledCount))
    .slice(0, 6);

  const institutionAnalytics = [...new Set(courses.filter((entry) => entry.isActive).map((entry) => `${entry.campus || 'Unassigned campus'}::${entry.department || 'Unassigned department'}`))]
    .map((compositeKey) => {
      const [campus, department] = compositeKey.split('::');
      const scopedCourses = courses.filter((entry) => (entry.campus || 'Unassigned campus') === campus && (entry.department || 'Unassigned department') === department && entry.isActive);
      return {
        label: `${campus} - ${department}`,
        courseCount: scopedCourses.length,
        sessionCount: sessions.filter((entry) => scopedCourses.some((course) => course.id === entry.courseId)).length,
        enrolledCount: enrollments.filter((entry) => scopedCourses.some((course) => course.id === entry.courseId)).length,
      };
    })
    .sort((left, right) => right.enrolledCount - left.enrolledCount)
    .slice(0, 8);

  const recentAuditTrail = auditLogs
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8)
    .map((entry) => ({
      label: entry.action,
      campus: entry.campus || 'N/A',
      department: entry.department || 'N/A',
      createdAt: new Date(entry.createdAt).toLocaleString(),
    }));

  return {
    highlightCards: [
      { label: 'Active users', value: users.filter((entry) => entry.isActive).length, helper: 'Accounts enabled across all roles' },
      { label: 'Registry claims', value: `${registryRecords.filter((entry) => entry.claimedByUserId).length}/${registryRecords.length}`, helper: 'Registry records linked to real user accounts' },
      { label: 'Live classes', value: sessions.filter((entry) => entry.status === 'active').length, helper: 'Sessions students can mark right now' },
      { label: 'Absence workload', value: queries.filter((entry) => entry.status === 'pending').length, helper: 'Queries still waiting for action' },
    ],
    charts: {
      attendanceBreakdown,
      roleBreakdown,
      queryBreakdown,
      campusBreakdown,
      facultyBreakdown,
    },
    tables: {
      courseAnalytics,
      institutionAnalytics,
      recentAuditTrail,
    },
  };
};

const buildLecturerAnalytics = async (userId) => {
  const [courses, sessions, queries] = await Promise.all([
    Course.findAll({
      where: { lecturerId: userId, isActive: true },
      attributes: ['id', 'courseCode', 'courseName', 'semester', 'academicYear'],
    }),
    Session.findAll({
      where: { lecturerId: userId },
      attributes: ['id', 'courseId', 'status', 'createdAt', 'date'],
    }),
    AbsenceQuery.findAll({
      where: { lecturerId: userId },
      attributes: ['id', 'status', 'createdAt', 'respondedAt'],
    }),
  ]);

  const courseIds = courses.map((course) => course.id);
  const attendances = courseIds.length
    ? await Attendance.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id', 'courseId', 'status', 'markedAt'] })
    : [];
  const enrollments = courseIds.length
    ? await Enrollment.findAll({ where: { courseId: { [Op.in]: courseIds } }, attributes: ['id', 'courseId'] })
    : [];

  const courseAnalytics = courses.map((course) => {
    const courseSessions = sessions.filter((entry) => entry.courseId === course.id);
    const courseAttendances = attendances.filter((entry) => entry.courseId === course.id);
    const registeredCount = enrollments.filter((entry) => entry.courseId === course.id).length;
    const markedCount = courseAttendances.length;
    const onTimeCount = courseAttendances.filter((entry) => entry.status === 'present').length;
    const lateCount = courseAttendances.filter((entry) => entry.status === 'late').length;
    const absentCount = courseAttendances.filter((entry) => entry.status === 'absent').length;

    return {
      courseId: course.id,
      courseLabel: formatCourseName(course),
      sessionCount: courseSessions.length,
      registeredCount,
      markedCount,
      onTimeCount,
      lateCount,
      absentCount,
    };
  });

  return {
    highlightCards: [
      { label: 'Assigned courses', value: courses.length, helper: 'Courses currently attached to your account' },
      { label: 'Open sessions', value: sessions.filter((entry) => entry.status === 'active').length, helper: 'Sessions still accepting attendance' },
      { label: 'Attendance marks', value: attendances.length, helper: 'Check-ins across your course load' },
      { label: 'Pending queries', value: queries.filter((entry) => entry.status === 'pending').length, helper: 'Student issues still waiting for a response' },
    ],
    charts: {
      attendanceBreakdown: ['present', 'late', 'absent', 'excused'].map((status) => ({
        label: status,
        value: attendances.filter((entry) => entry.status === status).length,
      })),
      queryBreakdown: ['pending', 'responded', 'closed'].map((status) => ({
        label: status,
        value: queries.filter((entry) => entry.status === status).length,
      })),
    },
    tables: {
      courseAnalytics,
    },
  };
};

const buildStudentAnalytics = async (userId) => {
  const [enrollments, attendances, queries] = await Promise.all([
    Enrollment.findAll({
      where: { userId, status: 'active' },
      include: [{ model: Course, as: 'course', attributes: ['id', 'courseCode', 'courseName', 'semester', 'academicYear'] }],
      attributes: ['id', 'courseId', 'semester', 'academicYear'],
    }),
    Attendance.findAll({
      where: { studentId: userId },
      include: [{ model: Course, as: 'course', attributes: ['id', 'courseCode', 'courseName'] }],
      attributes: ['id', 'courseId', 'status', 'markedAt'],
    }),
    AbsenceQuery.findAll({ where: { studentId: userId }, attributes: ['id', 'status', 'createdAt', 'respondedAt'] }),
  ]);

  const courseAnalytics = enrollments.map((enrollment) => {
    const courseAttendances = attendances.filter((entry) => entry.courseId === enrollment.courseId);
    return {
      courseId: enrollment.courseId,
      courseLabel: formatCourseName(enrollment.course),
      attendanceCount: courseAttendances.length,
      presentCount: courseAttendances.filter((entry) => entry.status === 'present').length,
      lateCount: courseAttendances.filter((entry) => entry.status === 'late').length,
      absentCount: courseAttendances.filter((entry) => entry.status === 'absent').length,
      semester: enrollment.semester,
      academicYear: enrollment.academicYear,
    };
  });

  return {
    highlightCards: [
      { label: 'Active courses', value: enrollments.length, helper: 'Courses you are currently enrolled in' },
      { label: 'Total marks', value: attendances.length, helper: 'Attendance records already captured' },
      { label: 'On-time marks', value: attendances.filter((entry) => entry.status === 'present').length, helper: 'Sessions you checked into within the time window' },
      { label: 'Outstanding queries', value: queries.filter((entry) => entry.status === 'pending').length, helper: 'Queries that still need your response' },
    ],
    charts: {
      attendanceBreakdown: ['present', 'late', 'absent', 'excused'].map((status) => ({
        label: status,
        value: attendances.filter((entry) => entry.status === status).length,
      })),
      queryBreakdown: ['pending', 'responded', 'closed'].map((status) => ({
        label: status,
        value: queries.filter((entry) => entry.status === status).length,
      })),
    },
    tables: {
      courseAnalytics,
    },
  };
};

const buildAdminNotifications = async () => {
  const [queries, sessions, registryRecords, rejectedAttempts] = await Promise.all([
    AbsenceQuery.findAll({
      include: [
        { model: User, as: 'student', attributes: ['firstName', 'lastName', 'matricNumber'] },
        { model: Session, as: 'session', include: [{ model: Course, as: 'course', attributes: ['courseCode'] }], attributes: ['id'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 5,
    }),
    Session.findAll({
      where: { status: 'active' },
      include: [{ model: Course, as: 'course', attributes: ['courseCode', 'courseName'] }],
      order: [['createdAt', 'DESC']],
      limit: 3,
    }),
    StudentRegistry.findAll({ where: { claimedByUserId: null, isActive: true }, order: [['createdAt', 'DESC']], limit: 3 }),
    AuditLog.findAll({
      where: {
        action: {
          [Op.like]: 'attendance.mark.rejected%',
        },
      },
      order: [['createdAt', 'DESC']],
      limit: 3,
    }),
  ]);

  const items = [
    ...queries.map((query) => ({
      title: `Query ${query.status} for ${fullName(query.student) || query.student?.matricNumber || 'student'}`,
      description: `${query.title}${query.session?.course?.courseCode ? ` on ${query.session.course.courseCode}` : ''}`,
      tone: query.status === 'pending' ? 'amber' : query.status === 'responded' ? 'blue' : 'emerald',
      createdAt: query.createdAt,
    })),
    ...sessions.map((session) => ({
      title: `Live session: ${session.course?.courseCode || 'Course session'}`,
      description: `${session.course?.courseName || 'Attendance session'} is open for marking.`,
      tone: 'blue',
      createdAt: session.createdAt,
    })),
    ...registryRecords.map((record) => ({
      title: `Unclaimed registry record`,
      description: `${record.matricNumber} is ready for student self-signup.`,
      tone: 'slate',
      createdAt: record.createdAt,
    })),
    ...rejectedAttempts.map((entry) => ({
      title: 'Blocked attendance attempt',
      description: `${entry.action.replace('attendance.mark.rejected.', '').replace(/\./g, ' ')} was recorded${entry.campus ? ` at ${entry.campus}` : ''}.`,
      tone: 'rose',
      createdAt: entry.createdAt,
    })),
  ];

  return sortByDateDesc(items, (entry) => entry.createdAt).slice(0, 10);
};

const buildLecturerNotifications = async (userId) => {
  const [queries, sessions, courses] = await Promise.all([
    AbsenceQuery.findAll({
      where: { lecturerId: userId },
      include: [
        { model: User, as: 'student', attributes: ['firstName', 'lastName', 'matricNumber'] },
        { model: Session, as: 'session', include: [{ model: Course, as: 'course', attributes: ['courseCode'] }], attributes: ['id'] },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 8,
    }),
    Session.findAll({
      where: { lecturerId: userId },
      include: [{ model: Course, as: 'course', attributes: ['courseCode', 'courseName'] }],
      order: [['updatedAt', 'DESC']],
      limit: 5,
    }),
    Course.findAll({
      where: { lecturerId: userId, isActive: true },
      include: [{ model: CourseSchedule, as: 'schedules', where: { isActive: true }, required: false }],
      attributes: ['id', 'courseCode', 'courseName'],
    }),
  ]);

  const items = [
    ...queries.map((query) => ({
      title: query.status === 'responded' ? 'Student replied to your query' : 'Absence query update',
      description: `${fullName(query.student) || query.student?.matricNumber || 'Student'}: ${query.title}`,
      tone: query.status === 'responded' ? 'emerald' : query.status === 'pending' ? 'amber' : 'slate',
      createdAt: query.updatedAt || query.createdAt,
    })),
    ...sessions
      .filter((session) => session.status === 'active' || session.status === 'closed')
      .map((session) => ({
        title: session.status === 'active' ? `Session still active` : `Session closed`,
        description: `${session.course?.courseCode || 'Course'} ${session.status === 'active' ? 'is still open for attendance' : 'has completed attendance capture'}.`,
        tone: session.status === 'active' ? 'blue' : 'emerald',
        createdAt: session.updatedAt || session.createdAt,
      })),
    ...buildUpcomingScheduleNotifications(courses, 'lecturer'),
  ];

  return sortByDateDesc(items, (entry) => entry.createdAt).slice(0, 10);
};

const buildStudentNotifications = async (userId) => {
  const [queries, attendances] = await Promise.all([
    AbsenceQuery.findAll({
      where: { studentId: userId },
      include: [{ model: Session, as: 'session', include: [{ model: Course, as: 'course', attributes: ['courseCode'] }], attributes: ['id'] }],
      order: [['updatedAt', 'DESC']],
      limit: 8,
    }),
    Attendance.findAll({
      where: { studentId: userId },
      include: [{ model: Course, as: 'course', attributes: ['courseCode', 'courseName'] }],
      order: [['markedAt', 'DESC']],
      limit: 5,
    }),
  ]);

  const enrollments = await Enrollment.findAll({
    where: { userId, status: 'active' },
    include: [{
      model: Course,
      as: 'course',
      attributes: ['id', 'courseCode', 'courseName'],
      include: [{ model: CourseSchedule, as: 'schedules', where: { isActive: true }, required: false }],
    }],
    order: [['createdAt', 'DESC']],
  });

  const items = [
    ...queries.map((query) => ({
      title: query.status === 'pending' ? 'New lecturer query' : query.status === 'closed' ? 'Query resolved' : 'Query update received',
      description: `${query.title}${query.session?.course?.courseCode ? ` (${query.session.course.courseCode})` : ''}`,
      tone: query.status === 'pending' ? 'amber' : query.status === 'closed' ? 'emerald' : 'blue',
      createdAt: query.updatedAt || query.createdAt,
    })),
    ...attendances.map((attendance) => ({
      title: `Attendance marked as ${attendance.status}`,
      description: `${attendance.course?.courseCode || 'Course'} was captured on ${new Date(attendance.markedAt).toLocaleString()}.`,
      tone: attendance.status === 'present' ? 'emerald' : attendance.status === 'late' ? 'amber' : 'rose',
      createdAt: attendance.markedAt,
    })),
    ...buildUpcomingScheduleNotifications(enrollments, 'student'),
  ];

  return sortByDateDesc(items, (entry) => entry.createdAt).slice(0, 10);
};

const helpArticlesByRole = {
  admin: [
    { title: 'How to prepare the system before semester begins', body: 'Create lecturers, upload the registry, review active courses, assign lecturers, and confirm building geofences before students start enrolling.' },
    { title: 'How to reactivate a locked account', body: 'Open Users, reactivate the user with a temporary password, and ask the user to complete the forced password reset on next login.' },
    { title: 'How to keep reports audit-ready', body: 'Export CSV/PDF reports after each major attendance cycle and archive them alongside your faculty semester records.' },
  ],
  lecturer: [
    { title: 'Best workflow for each class', body: 'Open a session shortly before class, project the QR, close the session after class, then review the absent list and outstanding student queries.' },
    { title: 'How geofencing works in class', body: 'When you choose a building during session creation, students must be physically inside the geofence to mark attendance successfully.' },
    { title: 'When to use PDF vs CSV reports', body: 'Use PDF for management meetings and approvals. Use CSV when you want to sort, filter, or merge records in Excel.' },
  ],
  student: [
    { title: 'How to avoid failed attendance marks', body: 'Use the QR code in class, keep location services enabled when required, and mark attendance before the lecturer closes the session.' },
    { title: 'What to do when you miss a class', body: 'Check Notifications and Queries, respond to any absence query promptly, and give a clear explanation if your lecturer requests one.' },
    { title: 'Why your course list matters', body: 'Only the courses you are actively enrolled in will count toward your dashboard, attendance logs, and lecturer query workflow.' },
  ],
};

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ');

exports.getAnalytics = async (req, res) => {
  try {
    let data;
    if (req.user.role === 'admin') {
      data = await buildAdminAnalytics();
    } else if (req.user.role === 'lecturer') {
      data = await buildLecturerAnalytics(req.user.id);
    } else {
      data = await buildStudentAnalytics(req.user.id);
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    let data;
    if (req.user.role === 'admin') {
      data = await buildAdminNotifications();
    } else if (req.user.role === 'lecturer') {
      data = await buildLecturerNotifications(req.user.id);
    } else {
      data = await buildStudentNotifications(req.user.id);
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHelpCenter = async (req, res) => {
  res.json({
    success: true,
    data: {
      role: req.user.role,
      articles: helpArticlesByRole[req.user.role] || helpArticlesByRole.student,
      contact: {
        email: 'support@attendance-system.local',
        responseTime: 'Within one working day',
      },
    },
  });
};
