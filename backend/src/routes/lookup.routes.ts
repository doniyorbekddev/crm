import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { CUSTOM_LABEL_FIELDS, lookupService } from '../services/lookup.service.js';
import type { CustomLabelField } from '../services/lookup.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { dictionaryEntryNameSchema } from '../validators/common.validator.js';

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
  // Kabinet ochuvchi ham guruh ro'yxatini tanlaydi (faqat nomlar)
  requireAnyPermission(PERMISSIONS.STUDENT_MANAGE, PERMISSIONS.STUDENT_CONVERT, PERMISSIONS.PORTAL_MANAGE),
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
  '/marketing-sources',
  requireAnyPermission(PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.ANALYTICS_VIEW),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.marketingSources());
  },
);

lookupRouter.get(
  '/salary-form',
  requireAnyPermission(PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_PAY),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await lookupService.salaryForm());
  },
);

lookupRouter.post(
  '/sources',
  // Lead formasi va reklama xarajati formasidan yangi manba qo'shiladi
  requireAnyPermission(PERMISSIONS.LEAD_CREATE, PERMISSIONS.LEAD_UPDATE, PERMISSIONS.EXPENSE_MANAGE),
  async (req: Request, res: Response) => {
    const { name } = z.object({ name: dictionaryEntryNameSchema }).parse(req.body);
    sendCreated(res, await lookupService.createSource(requireAuthUser(req), name, getClientInfo(req)), 'Manba qo‘shildi');
  },
);

/** Har bir maydon takliflari o'sha bo'limni ko'ra oladiganga ochiq */
const CUSTOM_LABEL_PERMISSIONS: Record<CustomLabelField, PermissionKey[]> = {
  'course-category': [PERMISSIONS.COURSE_VIEW, PERMISSIONS.COURSE_MANAGE],
  'parent-relation': [PERMISSIONS.PARENT_VIEW, PERMISSIONS.PARENT_MANAGE, PERMISSIONS.STUDENT_VIEW],
  'employee-position': [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE],
  'employee-department': [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE],
  'product-unit': [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_MANAGE],
};

lookupRouter.get(
  '/custom-labels/:field',
  // Avval ruxsat, keyin validatsiya: ruxsatsiz foydalanuvchi maydon nomlarini sinab ko'ra olmasin (doim 403)
  (req: Request, res: Response, next: NextFunction) => {
    const field = CUSTOM_LABEL_FIELDS.find((candidate) => candidate === req.params.field);
    const candidates = field ? CUSTOM_LABEL_PERMISSIONS[field] : [...new Set(Object.values(CUSTOM_LABEL_PERMISSIONS).flat())];
    requireAnyPermission(...candidates)(req, res, next);
  },
  async (req: Request, res: Response) => {
    const field = z.enum(CUSTOM_LABEL_FIELDS, 'Maydon noto‘g‘ri').parse(req.params.field);
    sendSuccess(res, await lookupService.customLabels(field));
  },
);
