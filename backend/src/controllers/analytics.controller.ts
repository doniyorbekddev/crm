import type { Request, Response } from 'express';
import { analyticsExport, analyticsService } from '../services/analytics.service.js';
import { branchScopeOf } from '../services/branchScope.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { businessDateString } from '../utils/dates.js';
import { sendTable } from '../utils/tableExport.js';
import { exportFormatSchema } from '../validators/common.validator.js';
import { analyticsRangeQuerySchema, cohortQuerySchema, profitabilityQuerySchema } from '../validators/analytics.validator.js';

export const analyticsController = {
  async unitEconomics(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await analyticsService.unitEconomics(analyticsRangeQuerySchema.parse(req.query), await branchScopeOf(requireAuthUser(req))));
  },

  async profitability(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await analyticsService.profitability(profitabilityQuerySchema.parse(req.query), await branchScopeOf(requireAuthUser(req))));
  },

  async cohorts(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await analyticsService.cohorts(cohortQuerySchema.parse(req.query), await branchScopeOf(requireAuthUser(req))));
  },

  async sources(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await analyticsService.sources(analyticsRangeQuerySchema.parse(req.query), await branchScopeOf(requireAuthUser(req))));
  },

  async exportProfitability(req: Request, res: Response): Promise<void> {
    const query = profitabilityQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    sendTable(res, await analyticsExport.profitability(query, await branchScopeOf(requireAuthUser(req))), `rentabellik-${query.dimension}-${businessDateString(new Date())}`, format);
  },

  async exportCohorts(req: Request, res: Response): Promise<void> {
    const query = cohortQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    sendTable(res, await analyticsExport.cohorts(query, await branchScopeOf(requireAuthUser(req))), `kohortlar-${businessDateString(new Date())}`, format);
  },

  async exportSources(req: Request, res: Response): Promise<void> {
    const query = analyticsRangeQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    sendTable(res, await analyticsExport.sources(query, await branchScopeOf(requireAuthUser(req))), `lead-manbalari-${businessDateString(new Date())}`, format);
  },
};
