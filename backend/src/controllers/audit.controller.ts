import type { Request, Response } from 'express';
import { auditLogService, auditService, exportAuditTable } from '../services/audit.service.js';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse.js';
import { businessDateString } from '../utils/dates.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { sendTable } from '../utils/tableExport.js';
import { auditListQuerySchema } from '../validators/audit.validator.js';
import { exportFormatSchema } from '../validators/common.validator.js';

export const auditController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = auditListQuerySchema.parse(req.query);
    const { items, total } = await auditLogService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async filters(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await auditLogService.filters());
  },

  /** Eksportning o‘zi ham auditga yoziladi — kim jurnalni yuklab olgani ko‘rinib tursin */
  async export(req: Request, res: Response): Promise<void> {
    const query = auditListQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    const table = await exportAuditTable(query);
    await auditService.record({
      userId: requireAuthUser(req).id,
      action: 'audit.exported',
      entityType: 'audit',
      metadata: {
        format,
        rows: table.rows.length,
        filters: { userId: query.userId ?? null, action: query.action ?? null, entityType: query.entityType ?? null, from: query.from ?? null, to: query.to ?? null },
      },
      ...getClientInfo(req),
    });
    sendTable(res, table, `audit-${businessDateString(new Date())}`, format);
  },
};
