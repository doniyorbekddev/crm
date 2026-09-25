import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { aiController } from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { aiAcademicRouter } from './aiAcademic.routes.js';

export const aiRouter = Router();

aiRouter.use(authenticate);

// AI akademik markaz — alohida ruxsat bilan (o'qituvchi ham)
aiRouter.use('/academic', aiAcademicRouter);

// Yordamchi: biznes (`ai.assistant`) yoki akademik (`ai.academic`) — har tool o'z ruxsatini tekshiradi
const assistant = requireAnyPermission(PERMISSIONS.AI_ASSISTANT, PERMISSIONS.AI_ACADEMIC);

aiRouter.get('/tools', assistant, aiController.tools);
aiRouter.get('/history', assistant, aiController.history);
// Savol har bir toolda bir nechta so'rov ishlatadi — rate limit bilan himoyalanadi
aiRouter.post('/ask', assistant, heavyLimiter, aiController.ask);
