const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  };
};

const adminOnly = roleMiddleware('admin');
const lecturerOnly = roleMiddleware('lecturer');
const adminOrLecturer = roleMiddleware('admin', 'lecturer');
const studentOnly = roleMiddleware('student');

module.exports = { roleMiddleware, adminOnly, lecturerOnly, adminOrLecturer, studentOnly };