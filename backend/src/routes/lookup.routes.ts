import { Router } from 'express';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { lookupService } from '../services/lookup.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** Formalar uchun ma’lumotnomalar (select’lar uchun ro‘yxatlar) */
export const lookupRouter = Router();

lookupRouter.use(authenticate);

lookupRouter.get(
  '/lead-form',
  requireAnyPermission(PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CREATE),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.leadForm());
  },
);

lookupRouter.get(
  '/group-form',
  requireAnyPermission(PERMISSIONS.GROUP_VIEW, PERMISSIONS.GROUP_MANAGE),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.groupForm());
  },
);

lookupRouter.get(
  '/student-form',
  requireAnyPermission(PERMISSIONS.STUDENT_MANAGE, PERMISSIONS.STUDENT_CONVERT),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.studentForm());
  },
);

lookupRouter.get(
  '/payment-form',
  requireAnyPermission(PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.DEBT_VIEW),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.paymentForm());
  },
);

lookupRouter.get(
  '/salary-form',
  requireAnyPermission(PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_PAY),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.salaryForm());
  },
);
