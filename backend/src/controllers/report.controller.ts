import type { Request, Response } from 'express';
import { permissionService } from '../services/permission.service.js';
import { reportService, reportToTable } from '../services/report.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { sendTable } from '../utils/tableExport.js';
import { reportExportQuerySchema, reportQuerySchema, reportTypeParamSchema } from '../validators/report.validator.js';
import type { ReportType } from '../validators/report.validator.js';
import { REPORT_EXTRA_PERMISSION } from '../config/reportPermissions.js';

async function assertReportAccess(req: Request, type: ReportType): Promise<void> {
  const required = REPORT_EXTRA_PERMISSION[type];
  if (!required) return;
  const permissions = await permissionService.getRolePermissions(requireAuthUser(req).roleId);
  if (!permissions.has(required)) {
    throw AppError.forbidden();
  }
}

export const reportController = {
  async build(req: Request, res: Response): Promise<void> {
    const { type } = reportTypeParamSchema.parse(req.params);
    await assertReportAccess(req, type);
    const query = reportQuerySchema.parse(req.query);
    sendSuccess(res, await reportService.build(type, query));
  },

  /** CSV (Excel uchun BOM bilan) yoki XLSX yuklab olish */
  async export(req: Request, res: Response): Promise<void> {
    const { type } = reportTypeParamSchema.parse(req.params);
    await assertReportAccess(req, type);
    const query = reportQuerySchema.parse(req.query);
    const { format } = reportExportQuerySchema.parse({ format: req.query.format });
    const report = await reportService.build(type, query);
    sendTable(res, reportToTable(report), `${type}-${report.from}_${report.to}`, format);
  },
};
