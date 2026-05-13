const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.get('/me/profile', userController.getMyProfile);
router.put('/me/profile', userController.updateMyProfile);
router.get('/me/course-options', roleMiddleware('student'), userController.getMyCourseOptions);
router.put('/me/enrollments', roleMiddleware('student'), userController.updateMyEnrollments);
router.get('/summary', roleMiddleware('admin'), userController.getSystemSummary);
router.get('/lecturers', roleMiddleware('admin'), userController.getLecturers);
router.get('/students', roleMiddleware('admin', 'lecturer'), userController.getStudents);
router.get('/', roleMiddleware('admin'), userController.getUsers);
router.get('/:id', roleMiddleware('admin'), userController.getUser);
router.get('/:id/enrollments', roleMiddleware('admin'), userController.getStudentEnrollments);
router.put('/:id', roleMiddleware('admin'), userController.updateUser);
router.put('/:id/enrollments', roleMiddleware('admin'), userController.updateStudentEnrollments);
router.post('/:id/reactivate', roleMiddleware('admin'), userController.reactivateUser);
router.delete('/:id', roleMiddleware('admin'), userController.deactivateUser);

module.exports = router;
