import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { academicAnalyticsController } from '../controllers/academicAnalytics.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';

/**
 * Akademik analitika (TZ 3.0 §46–49). Rahbar (`analytics.view`) — hammasi (filial doirasida);
 * o'qituvchi (`attendance.mark`) — faqat o'z guruhlari (servisda `teachingAccess`).
 */
export const academicAnalyticsRouter = Router();

academicAnalyticsRouter.use(authenticate);
academicAnalyticsRouter.get('/', heavyLimiter, requireAnyPermission(PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.ATTENDANCE_MARK), academicAnalyticsController.build);
