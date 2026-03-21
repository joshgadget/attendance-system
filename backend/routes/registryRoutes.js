const express = require('express');
const router = express.Router();
const registryController = require('../controllers/registryController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.get('/', registryController.getRegistry);
router.post('/', registryController.createRegistryRecord);
router.post('/bulk', registryController.bulkUpsertRegistry);

module.exports = router;
