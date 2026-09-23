import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { feedbackController } from '../controllers/feedback.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const feedbackRouter = Router();

feedbackRouter.use(authenticate);

// Aniq yo'l `/:id` dan oldin
feedbackRouter.get('/stats', requirePermission(PERMISSIONS.FEEDBACK_VIEW), feedbackController.stats);
feedbackRouter.get('/', requirePermission(PERMISSIONS.FEEDBACK_VIEW), feedbackController.list);
feedbackRouter.post('/', requirePermission(PERMISSIONS.FEEDBACK_MANAGE), feedbackController.create);
feedbackRouter.post('/:id/handle', requirePermission(PERMISSIONS.FEEDBACK_MANAGE), feedbackController.handle);
