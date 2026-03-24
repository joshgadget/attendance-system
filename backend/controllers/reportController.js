const PDFDocument = require('pdfkit');
const { Session, Attendance, Course, User } = require('../models');

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
        doc.text(`${name} (${matric}) - Present: ${entry.present}, Late: ${entry.late}, Absent: ${entry.absent}, Total: ${entry.total}`);
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
