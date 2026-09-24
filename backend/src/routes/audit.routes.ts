import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { auditController } from '../controllers/audit.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const auditRouter = Router();

auditRouter.use(authenticate, requirePermission(PERMISSIONS.AUDIT_VIEW));

// Sozlama — audit ko'rish emas, boshqarish huquqi bilan
auditRouter.get('/settings', auditController.settings);
auditRouter.put('/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), auditController.saveSettings);
auditRouter.get('/', auditController.list);
auditRouter.get('/filters', auditController.filters);
auditRouter.get('/export', heavyLimiter, requirePermission(PERMISSIONS.REPORT_EXPORT), auditController.export);
