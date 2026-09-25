import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { attendanceController } from '../controllers/attendance.controller.js';
import { groupController } from '../controllers/group.controller.js';
import { masteryController } from '../controllers/mastery.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const groupRouter = Router();

groupRouter.use(authenticate);

groupRouter.get('/', requirePermission(PERMISSIONS.GROUP_VIEW), groupController.list);
groupRouter.get('/:id', requirePermission(PERMISSIONS.GROUP_VIEW), groupController.getById);
groupRouter.get('/:id/mastery', requirePermission(PERMISSIONS.GROUP_VIEW), masteryController.group);
groupRouter.get('/:id/attendance', requirePermission(PERMISSIONS.ATTENDANCE_VIEW), attendanceController.getSheet);
groupRouter.post('/:id/attendance', requirePermission(PERMISSIONS.ATTENDANCE_MARK), attendanceController.mark);
groupRouter.post('/', requirePermission(PERMISSIONS.GROUP_MANAGE), groupController.create);
groupRouter.put('/:id', requirePermission(PERMISSIONS.GROUP_MANAGE), groupController.update);
groupRouter.delete('/:id', requirePermission(PERMISSIONS.GROUP_MANAGE), groupController.remove);
