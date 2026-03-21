const { Session, Attendance, Course, User } = require('../models');

exports.getCourseReport = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role === 'lecturer' && course.lecturerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const sessions = await Session.findAll({
      where: { courseId: req.params.courseId, status: 'closed' },
      include: [{ model: Attendance, as: 'attendances', include: [{ model: User, as: 'student' }] }]
    });

    const stats = {};
    sessions.forEach(s => s.attendances.forEach(a => {
      if (!stats[a.studentId]) stats[a.studentId] = { student: a.student, present: 0, late: 0, absent: 0, total: 0 };
      stats[a.studentId][a.status]++;
      stats[a.studentId].total++;
    }));

    res.json({
      success: true,
      data: {
        course,
        sessionsCount: sessions.length,
        students: Object.values(stats),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const report = await exports.getCourseReport(req, res);
    // CSV export logic here if needed
    res.json({ success: true, message: 'Export feature - implement CSV generation' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
