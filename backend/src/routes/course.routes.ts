import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { courseController } from '../controllers/course.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const courseRouter = Router();

courseRouter.use(authenticate);

courseRouter.get('/', requirePermission(PERMISSIONS.COURSE_VIEW), courseController.list);
courseRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_VIEW), courseController.getById);
courseRouter.post('/', requirePermission(PERMISSIONS.COURSE_MANAGE), courseController.create);
courseRouter.put('/:id', requirePermission(PERMISSIONS.COURSE_MANAGE), courseController.update);
courseRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_MANAGE), courseController.remove);
