const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const authMiddleware = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.get('/mine', roleMiddleware('student', 'lecturer', 'admin'), courseController.getMyCourses);
router.get('/schedules', roleMiddleware('admin', 'lecturer'), courseController.getCourseSchedules);
router.get('/', roleMiddleware('admin', 'lecturer'), courseController.getCourses);
router.post('/bulk', roleMiddleware('admin'), courseController.bulkUpsertCourses);
router.post('/timetable/pdf-import', roleMiddleware('admin'), courseController.importTimetablePdf);
router.post('/schedules/bulk', roleMiddleware('admin'), courseController.bulkUpsertSchedules);
router.delete('/schedules/:scheduleId', roleMiddleware('admin'), courseController.removeCourseSchedule);
router.post('/:id/enrollments/bulk', roleMiddleware('admin', 'lecturer'), courseController.bulkEnrollStudentsForCourse);
router.get('/:id', roleMiddleware('admin', 'lecturer'), courseController.getCourse);
router.post('/', roleMiddleware('admin'), courseController.createCourse);
router.put('/:id', roleMiddleware('admin'), courseController.updateCourse);
router.delete('/:id/schedules', roleMiddleware('admin'), courseController.clearCourseSchedules);
router.delete('/:id', roleMiddleware('admin'), courseController.deactivateCourse);

module.exports = router;
