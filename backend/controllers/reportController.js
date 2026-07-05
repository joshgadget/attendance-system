const PDFDocument = require('pdfkit');
const { Session, Attendance, Course, User, AbsenceQuery, Enrollment } = require('../models');

const pushTableLine = (doc, text) => {
  doc.fontSize(10).text(text);
};

const buildCourseReport = async (courseId, requester) => {
  const course = await Course.findByPk(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }
  if (requester.role === 'lecturer' && course.lecturerId !== requester.id) {
    const error = new Error('Not authorized');
    error.statusCode = 403;
    throw error;
  }

  const sessions = await Session.findAll({
    where: { courseId, status: 'closed' },
    include: [{ model: Attendance, as: 'attendances', include: [{ model: User, as: 'student' }] }]
  });

  const stats = {};
  sessions.forEach((session) => session.attendances.forEach((attendance) => {
    if (!stats[attendance.studentId]) {
      stats[attendance.studentId] = {
        student: attendance.student,
        present: 0,
        late: 0,
        absent: 0,
        total: 0,
      };
    }
    stats[attendance.studentId][attendance.status] += 1;
    stats[attendance.studentId].total += 1;
  }));

  return {
    course,
    sessionsCount: sessions.length,
    students: Object.values(stats),
  };
};

const buildSystemReport = async () => {
  const [users, courses, sessions, attendances, queries, enrollments] = await Promise.all([
    User.findAll({ attributes: ['id', 'role', 'isActive', 'department', 'faculty'] }),
    Course.findAll({ attributes: ['id', 'courseCode', 'courseName', 'semester', 'academicYear', 'department', 'faculty', 'isActive'] }),
    Session.findAll({ attributes: ['id', 'courseId', 'status', 'date'] }),
    Attendance.findAll({ attributes: ['id', 'courseId', 'status', 'studentId', 'markedAt'] }),
    AbsenceQuery.findAll({ attributes: ['id', 'status', 'createdAt'] }),
    Enrollment.findAll({ attributes: ['id', 'courseId', 'userId', 'semester', 'academicYear'] }),
  ]);

  return {
    totals: {
      activeUsers: users.filter((user) => user.isActive).length,
      activeCourses: courses.filter((course) => course.isActive).length,
      liveSessions: sessions.filter((session) => session.status === 'active').length,
      attendanceMarks: attendances.length,
      pendingQueries: queries.filter((query) => query.status === 'pending').length,
      activeEnrollments: enrollments.length,
    },
    byRole: ['admin', 'lecturer', 'student'].map((role) => ({
      label: role,
      value: users.filter((user) => user.role === role && user.isActive).length,
    })),
    topCourses: courses
      .filter((course) => course.isActive)
      .map((course) => {
        const courseSessions = sessions.filter((session) => session.courseId === course.id);
        const courseAttendances = attendances.filter((attendance) => attendance.courseId === course.id);
        const courseEnrollments = enrollments.filter((enrollment) => enrollment.courseId === course.id);
        return {
          courseCode: course.courseCode,
          courseName: course.courseName,
          sessionCount: courseSessions.length,
          enrollmentCount: courseEnrollments.length,
          attendanceCount: courseAttendances.length,
        };
      })
      .sort((left, right) => (right.attendanceCount + right.enrollmentCount) - (left.attendanceCount + left.enrollmentCount))
      .slice(0, 10),
  };
};

const buildMyAttendanceReport = async (requester) => {
  const attendances = await Attendance.findAll({
    where: { studentId: requester.id },
    include: [
      { model: Course, as: 'course', attributes: ['courseCode', 'courseName', 'semester', 'academicYear'] },
      { model: Session, as: 'session', attributes: ['date', 'startTime', 'sessionKey'] },
    ],
    order: [['markedAt', 'DESC']],
  });

  return {
    student: requester,
    totals: {
      present: attendances.filter((entry) => entry.status === 'present').length,
      late: attendances.filter((entry) => entry.status === 'late').length,
      absent: attendances.filter((entry) => entry.status === 'absent').length,
      excused: attendances.filter((entry) => entry.status === 'excused').length,
      total: attendances.length,
    },
    entries: attendances,
  };
};

exports.getCourseReport = async (req, res) => {
  try {
    const report = await buildCourseReport(req.params.courseId, req.user);
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const report = await buildCourseReport(req.params.courseId, req.user);

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${report.course.courseCode}.pdf"`);
      doc.pipe(res);

      doc.fontSize(18).text('Attendance Summary', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Course: ${report.course.courseCode} - ${report.course.courseName}`);
      doc.text(`Sessions closed: ${report.sessionsCount}`);
      doc.moveDown();

      doc.fontSize(11).text('Student Summary');
      doc.moveDown(0.5);
      report.students.forEach((entry) => {
        const name = `${entry.student?.firstName || ''} ${entry.student?.lastName || ''}`.trim() || 'Unknown';
        const matric = entry.student?.matricNumber || entry.student?.email || 'N/A';
        pushTableLine(doc, `${name} (${matric}) - Present: ${entry.present}, Late: ${entry.late}, Absent: ${entry.absent}, Total: ${entry.total}`);
      });

      doc.end();
      return;
    }

    const lines = [
      'Matric,Name,Email,Present,Late,Absent,Total',
      ...report.students.map((entry) => {
        const name = `${entry.student?.firstName || ''} ${entry.student?.lastName || ''}`.trim();
        const matric = entry.student?.matricNumber || '';
        const email = entry.student?.email || '';
        return `"${matric}","${name}","${email}",${entry.present},${entry.late},${entry.absent},${entry.total}`;
      })
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${report.course.courseCode}.csv"`);
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSystemReport = async (req, res) => {
  try {
    const report = await buildSystemReport();
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportSystemReport = async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const report = await buildSystemReport();

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_system_summary.pdf"');
      doc.pipe(res);

      doc.fontSize(18).text('Attendance System Summary');
      doc.moveDown();
      Object.entries(report.totals).forEach(([key, value]) => {
        pushTableLine(doc, `${key}: ${value}`);
      });
      doc.moveDown();
      doc.fontSize(12).text('Top courses');
      doc.moveDown(0.5);
      report.topCourses.forEach((entry) => {
        pushTableLine(doc, `${entry.courseCode} - ${entry.courseName}: Sessions ${entry.sessionCount}, Enrollments ${entry.enrollmentCount}, Attendance ${entry.attendanceCount}`);
      });

      doc.end();
      return;
    }

    const lines = [
      'Metric,Value',
      ...Object.entries(report.totals).map(([key, value]) => `"${key}",${value}`),
      '',
      'Course Code,Course Name,Sessions,Enrollments,Attendance Marks',
      ...report.topCourses.map((entry) => `"${entry.courseCode}","${entry.courseName}",${entry.sessionCount},${entry.enrollmentCount},${entry.attendanceCount}`),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance_system_summary.csv"');
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyAttendanceReport = async (req, res) => {
  try {
    const report = await buildMyAttendanceReport(req.user);
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportMyAttendanceReport = async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const report = await buildMyAttendanceReport(req.user);

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="my_attendance_report.pdf"');
      doc.pipe(res);

      doc.fontSize(18).text('My Attendance Report');
      doc.moveDown();
      pushTableLine(doc, `Student: ${req.user.firstName} ${req.user.lastName}`);
      Object.entries(report.totals).forEach(([key, value]) => {
        pushTableLine(doc, `${key}: ${value}`);
      });
      doc.moveDown();
      report.entries.forEach((entry) => {
        pushTableLine(doc, `${entry.course?.courseCode || 'Course'} - ${entry.status} - ${entry.session?.date || ''} ${entry.session?.startTime || ''}`);
      });

      doc.end();
      return;
    }

    const lines = [
      'Course Code,Course Name,Session Date,Start Time,Status,Marked At',
      ...report.entries.map((entry) => `"${entry.course?.courseCode || ''}","${entry.course?.courseName || ''}","${entry.session?.date || ''}","${entry.session?.startTime || ''}","${entry.status}","${entry.markedAt || ''}"`),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="my_attendance_report.csv"');
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
