import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { aiController } from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const aiRouter = Router();

aiRouter.use(authenticate);

const assistant = requirePermission(PERMISSIONS.AI_ASSISTANT);

aiRouter.get('/tools', assistant, aiController.tools);
aiRouter.get('/history', assistant, aiController.history);
// Savol har bir toolda bir nechta so'rov ishlatadi — rate limit bilan himoyalanadi
aiRouter.post('/ask', assistant, heavyLimiter, aiController.ask);
