import type { Request, Response } from 'express';
import { billingService } from '../services/billing.service.js';
import { branchFilter, getBranchAccess } from '../services/branchAccess.js';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { billingReportQuerySchema, monthlyDebtorsQuerySchema, outstandingDebtsQuerySchema } from '../validators/billing.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export const billingController = {
  /** A. Tanlangan oy qarzdorlari */
  async monthly(req: Request, res: Response): Promise<void> {
    const query = monthlyDebtorsQuerySchema.parse(req.query);
    const { items, total, summary } = await billingService.monthlyDebtors(query, branchFilter(await getBranchAccess(requireAuthUser(req))));
    sendSuccess(res, { items, summary }, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  /** B. Barcha oylardan qolgan qarzlar */
  async outstanding(req: Request, res: Response): Promise<void> {
    const query = outstandingDebtsQuerySchema.parse(req.query);
    const { items, total, summary } = await billingService.outstanding(query, branchFilter(await getBranchAccess(requireAuthUser(req))));
    sendSuccess(res, { items, summary }, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  /** C. O'quvchi qarz tarixi */
  async studentHistory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await billingService.studentHistory(requireAuthUser(req), id));
  },

  /** Oylik hisobot: hisoblangan / yig'ilgan / kassa / qarz */
  async report(req: Request, res: Response): Promise<void> {
    const query = billingReportQuerySchema.parse(req.query);
    sendSuccess(res, await billingService.report(query, branchFilter(await getBranchAccess(requireAuthUser(req)))));
  },
};
