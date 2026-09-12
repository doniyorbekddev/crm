import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { reportController } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get('/:type/export', heavyLimiter, requirePermission(PERMISSIONS.REPORT_EXPORT), reportController.export);
reportRouter.get('/:type', heavyLimiter, requirePermission(PERMISSIONS.REPORT_VIEW), reportController.build);
