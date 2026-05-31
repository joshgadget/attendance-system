const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const siteSettingController = require('../controllers/siteSettingController');

router.get('/maintenance', siteSettingController.getMaintenanceSettings);
router.put('/maintenance', authMiddleware, roleMiddleware('admin'), siteSettingController.updateMaintenanceSettings);

module.exports = router;
