const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const securityController = require('../controllers/securityController');

router.use(authMiddleware);

router.get('/devices', securityController.listDevices);
router.post('/devices/register', securityController.registerDevice);
router.delete('/devices/:id', securityController.revokeDevice);

router.get('/review', roleMiddleware('lecturer', 'admin'), securityController.getPendingReview);
router.put('/review/:id', roleMiddleware('lecturer', 'admin'), securityController.reviewAction);
router.get('/attempts/suspicious', roleMiddleware('lecturer', 'admin'), securityController.getSuspiciousAttempts);

module.exports = router;
