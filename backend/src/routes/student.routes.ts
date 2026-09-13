import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { attendanceAnalyticsController } from '../controllers/attendanceSession.controller.js';
import { parentController } from '../controllers/parent.controller.js';
import { studentController } from '../controllers/student.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';

export const studentRouter = Router();

studentRouter.use(authenticate);

studentRouter.get('/', requirePermission(PERMISSIONS.STUDENT_VIEW), studentController.list);
studentRouter.get('/summary', requirePermission(PERMISSIONS.STUDENT_VIEW), studentController.summary);
studentRouter.get('/export', heavyLimiter, requirePermission(PERMISSIONS.STUDENT_VIEW), requirePermission(PERMISSIONS.REPORT_EXPORT), studentController.export);
studentRouter.get('/:id', requirePermission(PERMISSIONS.STUDENT_VIEW), studentController.getById);
studentRouter.get('/:id/profile', requirePermission(PERMISSIONS.STUDENT_VIEW), studentController.profile);
studentRouter.get('/:id/homework', requirePermission(PERMISSIONS.HOMEWORK_VIEW), studentController.homework);
studentRouter.get('/:id/exams', requirePermission(PERMISSIONS.EXAM_VIEW), studentController.exams);
studentRouter.get('/:id/parents', requirePermission(PERMISSIONS.PARENT_VIEW), parentController.forStudent);
studentRouter.get('/:id/attendance', requirePermission(PERMISSIONS.ATTENDANCE_VIEW), studentController.attendanceHistory);
studentRouter.get('/:id/attendance/calendar', requirePermission(PERMISSIONS.ATTENDANCE_VIEW), attendanceAnalyticsController.calendar);
studentRouter.post('/', requirePermission(PERMISSIONS.STUDENT_MANAGE), studentController.create);
studentRouter.put('/:id', requirePermission(PERMISSIONS.STUDENT_MANAGE), studentController.update);
studentRouter.patch('/:id/status', requirePermission(PERMISSIONS.STUDENT_MANAGE), studentController.setStatus);
studentRouter.delete('/:id', requirePermission(PERMISSIONS.STUDENT_MANAGE), studentController.remove);
