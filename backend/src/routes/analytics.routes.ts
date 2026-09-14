import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { analyticsController } from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate, requirePermission(PERMISSIONS.ANALYTICS_VIEW));

analyticsRouter.get('/unit-economics', heavyLimiter, analyticsController.unitEconomics);
analyticsRouter.get('/profitability', heavyLimiter, analyticsController.profitability);
analyticsRouter.get('/cohorts', heavyLimiter, analyticsController.cohorts);
analyticsRouter.get('/sources', heavyLimiter, analyticsController.sources);

const canExport = requirePermission(PERMISSIONS.REPORT_EXPORT);
analyticsRouter.get('/profitability/export', heavyLimiter, canExport, analyticsController.exportProfitability);
analyticsRouter.get('/cohorts/export', heavyLimiter, canExport, analyticsController.exportCohorts);
analyticsRouter.get('/sources/export', heavyLimiter, canExport, analyticsController.exportSources);
