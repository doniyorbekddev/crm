import type { Request, Response } from 'express';
import { auditLogService } from '../services/audit.service.js';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse.js';
import { auditListQuerySchema } from '../validators/audit.validator.js';

export const auditController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = auditListQuerySchema.parse(req.query);
    const { items, total } = await auditLogService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async filters(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await auditLogService.filters());
  },
};
