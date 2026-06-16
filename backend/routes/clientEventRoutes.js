const express = require('express');
const router = express.Router();
const clientEventController = require('../controllers/clientEventController');

router.post('/errors', clientEventController.recordClientError);
router.post('/metrics', clientEventController.recordClientMetric);

module.exports = router;
