import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { courseController } from '../controllers/course.controller.js';
import { curriculumController } from '../controllers/curriculum.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const courseRouter = Router();

courseRouter.use(authenticate);

courseRouter.get('/', requirePermission(PERMISSIONS.COURSE_VIEW), courseController.list);
courseRouter.get('/:id', requirePermission(PERMISSIONS.COURSE_VIEW), courseController.getById);
courseRouter.get('/:id/curriculum', requirePermission(PERMISSIONS.COURSE_VIEW), curriculumController.forCourse);
courseRouter.post('/:id/modules', requirePermission(PERMISSIONS.COURSE_MANAGE), curriculumController.createModule);
courseRouter.post('/', requirePermission(PERMISSIONS.COURSE_MANAGE), courseController.create);
courseRouter.put('/:id', requirePermission(PERMISSIONS.COURSE_MANAGE), courseController.update);
courseRouter.delete('/:id', requirePermission(PERMISSIONS.COURSE_MANAGE), courseController.remove);
