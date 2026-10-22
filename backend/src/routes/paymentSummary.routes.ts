import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PAYMENT_SUMMARY_SCOPES, paymentSummaryService } from '../services/paymentSummary.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { sendTable } from '../utils/tableExport.js';
import { exportFormatSchema } from '../validators/common.validator.js';

/** To'lov xulosasi: jami shartnoma / yig'ilgan / qolgan va yo'nalishlar bo'yicha (filial doirasida) */
export const paymentSummaryRouter = Router();

paymentSummaryRouter.use(authenticate, requirePermission(PERMISSIONS.DEBT_VIEW));

const scopeSchema = z.object({ scope: z.enum(PAYMENT_SUMMARY_SCOPES).default('ALL') });

paymentSummaryRouter.get('/', async (req: Request, res: Response) => {
  const { scope } = scopeSchema.parse(req.query);
  sendSuccess(res, await paymentSummaryService.summary(requireAuthUser(req), scope));
});

paymentSummaryRouter.get('/export', heavyLimiter, requirePermission(PERMISSIONS.REPORT_EXPORT), async (req: Request, res: Response) => {
  const { scope } = scopeSchema.parse(req.query);
  const format = exportFormatSchema.parse(req.query.format);
  const summary = await paymentSummaryService.summary(requireAuthUser(req), scope);
  sendTable(res, paymentSummaryService.toExport(summary), `tolov-xulosasi-${summary.generatedAt.slice(0, 10)}`, format);
});
