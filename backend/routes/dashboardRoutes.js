const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.use(authMiddleware);

router.get('/analytics', dashboardController.getAnalytics);
router.get('/notifications', dashboardController.getNotifications);
router.get('/help', dashboardController.getHelpCenter);

module.exports = router;
