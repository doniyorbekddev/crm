import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { aiAcademicController } from '../controllers/aiAcademic.controller.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

/**
 * AI akademik markaz (TZ 3.0 §30–41). Hammasi `ai.academic` + servisdagi doira (o'qituvchi —
 * o'z guruhi). Yangi tahlil yaratish (POST) — modelga so'rov ketishi mumkin, rate limit bilan.
 */
export const aiAcademicRouter = Router();

aiAcademicRouter.use(requirePermission(PERMISSIONS.AI_ACADEMIC));

aiAcademicRouter.get('/status', aiAcademicController.status);
aiAcademicRouter.get('/students/:id', aiAcademicController.latestStudent);
aiAcademicRouter.post('/students/:id', heavyLimiter, aiAcademicController.analyzeStudent);
aiAcademicRouter.get('/groups/:id', aiAcademicController.latestGroup);
aiAcademicRouter.post('/groups/:id', heavyLimiter, aiAcademicController.analyzeGroup);
aiAcademicRouter.get('/submissions/:homeworkId/:studentId', aiAcademicController.latestReview);
aiAcademicRouter.post('/submissions/:homeworkId/:studentId', heavyLimiter, aiAcademicController.reviewSubmission);
aiAcademicRouter.get('/homework/:id/similarity', aiAcademicController.similarity);
aiAcademicRouter.post('/remedial', heavyLimiter, aiAcademicController.remedial);
aiAcademicRouter.post('/analyses/:id/accept', aiAcademicController.accept);
aiAcademicRouter.post('/analyses/:id/reject', aiAcademicController.reject);
