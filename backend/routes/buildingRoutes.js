const express = require('express');
const router = express.Router();
const buildingController = require('../controllers/buildingController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.get('/', roleMiddleware('admin', 'lecturer'), buildingController.getBuildings);
router.post('/', roleMiddleware('admin'), buildingController.createBuilding);
router.put('/:id', roleMiddleware('admin'), buildingController.updateBuilding);
router.delete('/:id', roleMiddleware('admin'), buildingController.deactivateBuilding);

module.exports = router;
