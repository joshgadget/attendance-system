const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.get('/mine', roleMiddleware('student', 'lecturer', 'admin'), courseController.getMyCourses);
router.get('/', roleMiddleware('admin', 'lecturer'), courseController.getCourses);
router.get('/:id', roleMiddleware('admin', 'lecturer'), courseController.getCourse);
router.post('/', roleMiddleware('admin'), courseController.createCourse);
router.put('/:id', roleMiddleware('admin'), courseController.updateCourse);
router.delete('/:id', roleMiddleware('admin'), courseController.deactivateCourse);

module.exports = router;
