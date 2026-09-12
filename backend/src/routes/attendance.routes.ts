import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { attendanceAnalyticsController, attendanceSessionController } from '../controllers/attendanceSession.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

/** Davomat statistikasi, reytingi va o‘qituvchi paneli */
export const attendanceRouter = Router();

attendanceRouter.use(authenticate, requirePermission(PERMISSIONS.ATTENDANCE_VIEW));

attendanceRouter.get('/stats', attendanceAnalyticsController.stats);
attendanceRouter.get('/ranking', attendanceAnalyticsController.ranking);
attendanceRouter.get('/teacher-overview', attendanceAnalyticsController.teacherOverview);

/** Dars seanslari */
export const attendanceSessionRouter = Router();

attendanceSessionRouter.use(authenticate);

attendanceSessionRouter.get('/', requirePermission(PERMISSIONS.ATTENDANCE_VIEW), attendanceSessionController.list);
attendanceSessionRouter.get('/:id', requirePermission(PERMISSIONS.ATTENDANCE_VIEW), attendanceSessionController.getById);
attendanceSessionRouter.post('/', requirePermission(PERMISSIONS.ATTENDANCE_MARK), attendanceSessionController.create);
attendanceSessionRouter.put('/:id', requirePermission(PERMISSIONS.ATTENDANCE_MARK), attendanceSessionController.update);
attendanceSessionRouter.delete('/:id', requirePermission(PERMISSIONS.ATTENDANCE_MARK), attendanceSessionController.remove);
