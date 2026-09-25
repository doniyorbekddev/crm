import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { lessonController } from '../controllers/lesson.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { uploadBody } from './document.routes.js';

/** LMS darslari. Ko'rish — `course.view`, tahrirlash — `lesson.manage` (+ kurs doirasi servisda) */
export const lessonRouter = Router();

lessonRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.COURSE_VIEW);
const manage = requirePermission(PERMISSIONS.LESSON_MANAGE);

lessonRouter.get('/materials/:id/download', view, lessonController.downloadMaterial);
lessonRouter.delete('/materials/:id', manage, lessonController.removeMaterial);
lessonRouter.get('/:id', view, lessonController.getById);
lessonRouter.put('/:id', manage, lessonController.update);
lessonRouter.delete('/:id', manage, lessonController.remove);
lessonRouter.post('/:id/materials', manage, lessonController.addLink);
lessonRouter.post('/:id/materials/upload', manage, uploadBody, lessonController.upload);
