import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { portalController } from '../controllers/portal.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { uploadBody } from './document.routes.js';

export const portalRouter = Router();

portalRouter.use(authenticate);

// Kabinet — faqat o'quvchi va ota-ona hisoblari uchun. Ma'lumot doirasi servis ichida
// `Student.userId` / `Parent.userId` bog'lanishi bo'yicha aniqlanadi (ownership).
const portalAccess = requireAnyPermission(PERMISSIONS.PORTAL_STUDENT, PERMISSIONS.PORTAL_PARENT);

portalRouter.get('/me', portalAccess, portalController.me);
portalRouter.get('/profile', portalAccess, portalController.profile);
portalRouter.get('/schedule', portalAccess, portalController.schedule);
portalRouter.get('/lessons', portalAccess, portalController.lessons);
portalRouter.get('/curriculum', portalAccess, portalController.curriculum);
portalRouter.get('/certificates', portalAccess, portalController.certificates);
portalRouter.get('/overview', portalAccess, portalController.overview);
portalRouter.get('/homework', portalAccess, portalController.homework);
portalRouter.get('/homework/:id', portalAccess, portalController.homeworkDetail);
portalRouter.get('/homework/:id/attachment', portalAccess, portalController.homeworkAttachment);
// O'quvchi vazifani o'zi topshiradi: matn — JSON, fayl — xom tana (hujjatlar bilan bir xil)
portalRouter.post('/homework/:id/submit', portalAccess, portalController.submitHomework);
portalRouter.post('/homework/:id/attachment', portalAccess, uploadBody, portalController.submitHomeworkAttachment);
portalRouter.get('/exams', portalAccess, portalController.exams);
portalRouter.get('/exams/:id', portalAccess, portalController.examDetail);
portalRouter.get('/attendance/calendar', portalAccess, portalController.attendanceCalendar);
portalRouter.get('/gamification', portalAccess, portalController.gamification);
portalRouter.get('/payments', portalAccess, portalController.payments);
portalRouter.get('/feedback', portalAccess, portalController.feedbackState);
portalRouter.post('/feedback', portalAccess, portalController.submitFeedback);
