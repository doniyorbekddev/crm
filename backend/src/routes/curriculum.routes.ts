import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { curriculumController } from '../controllers/curriculum.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';

export const curriculumRouter = Router();

curriculumRouter.use(authenticate);

// Modul va mavzu tahrirlash — kurs boshqaruvi ruxsati
curriculumRouter.put('/modules/:id', requirePermission(PERMISSIONS.COURSE_MANAGE), curriculumController.updateModule);
curriculumRouter.post('/modules/:id/topics', requirePermission(PERMISSIONS.COURSE_MANAGE), curriculumController.createTopic);
curriculumRouter.put('/topics/:id', requirePermission(PERMISSIONS.COURSE_MANAGE), curriculumController.updateTopic);

// Mavzuni o'tilgan deb belgilash — o'qituvchi ham qila oladi (o'z guruhida, servisda tekshiriladi)
curriculumRouter.post(
  '/topics/:id/mark',
  requireAnyPermission(PERMISSIONS.COURSE_MANAGE, PERMISSIONS.ATTENDANCE_MARK),
  curriculumController.markTopic,
);
