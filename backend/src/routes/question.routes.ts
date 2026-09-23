import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { questionController } from '../controllers/question.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const questionRouter = Router();

questionRouter.use(authenticate);

// Savollar bazasi — imtihon boshqaruvi ruxsati (o'qituvchida ham bor)
questionRouter.get('/', requirePermission(PERMISSIONS.EXAM_VIEW), questionController.list);
questionRouter.post('/', requirePermission(PERMISSIONS.EXAM_MANAGE), questionController.create);
questionRouter.put('/:id', requirePermission(PERMISSIONS.EXAM_MANAGE), questionController.update);
