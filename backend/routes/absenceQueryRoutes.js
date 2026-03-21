const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const absenceQueryController = require('../controllers/absenceQueryController');

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

router.use(authMiddleware);

router.get('/', absenceQueryController.getQueries);
router.post('/', requireRole('lecturer', 'admin'), absenceQueryController.createQuery);
router.patch('/:id/respond', requireRole('student', 'admin'), absenceQueryController.respondToQuery);
router.patch('/:id/close', requireRole('lecturer', 'admin'), absenceQueryController.closeQuery);

module.exports = router;
