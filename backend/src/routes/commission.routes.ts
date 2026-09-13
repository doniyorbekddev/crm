import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { commissionController } from '../controllers/commission.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const commissionRouter = Router();

commissionRouter.use(authenticate);

/** O‘qituvchining o‘z foizi — boshqa o‘qituvchilarniki ko‘rinmaydi */
commissionRouter.get('/me', requirePermission(PERMISSIONS.COMMISSION_VIEW_OWN), commissionController.mine);
commissionRouter.get('/', requirePermission(PERMISSIONS.SALARY_VIEW), commissionController.list);
commissionRouter.get('/:teacherProfileId', requirePermission(PERMISSIONS.SALARY_VIEW), commissionController.detail);
