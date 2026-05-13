const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const auditController = require('../controllers/auditController');

router.use(authMiddleware);
router.get('/summary', roleMiddleware('admin'), auditController.getAuditSummary);
router.get('/', roleMiddleware('admin'), auditController.getAuditLogs);

module.exports = router;
