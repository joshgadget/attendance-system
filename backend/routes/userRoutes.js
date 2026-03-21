const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.get('/summary', roleMiddleware('admin'), userController.getSystemSummary);
router.get('/lecturers', roleMiddleware('admin', 'lecturer'), userController.getLecturers);
router.get('/students', roleMiddleware('admin', 'lecturer'), userController.getStudents);
router.get('/', roleMiddleware('admin'), userController.getUsers);
router.get('/:id', roleMiddleware('admin', 'lecturer'), userController.getUser);
router.put('/:id', roleMiddleware('admin'), userController.updateUser);
router.delete('/:id', roleMiddleware('admin'), userController.deactivateUser);

module.exports = router;
