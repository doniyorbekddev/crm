import type { Request, Response } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import { permissionService } from '../services/permission.service.js';
import { reportService, reportToTable } from '../services/report.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { sendTable } from '../utils/tableExport.js';
import { reportExportQuerySchema, reportQuerySchema, reportTypeParamSchema } from '../validators/report.validator.js';
import type { ReportType } from '../validators/report.validator.js';

/**
 * Moliyaviy va xodimlarga oid hisobotlar uchun `report.view` yetarli emas —
 * tegishli modul ruxsati ham kerak (masalan, maoshni faqat salary.view egasi ko‘radi).
 */
const EXTRA_PERMISSION: Partial<Record<ReportType, PermissionKey>> = {
  // O‘quvchi ismi, telefoni va qarzi / to‘lovlari — shaxsiy moliyaviy ma’lumot
  debts: PERMISSIONS.DEBT_VIEW,
  payments: PERMISSIONS.PAYMENT_VIEW,
  teachers: PERMISSIONS.TEACHER_VIEW,
  salaries: PERMISSIONS.SALARY_VIEW,
  incomes: PERMISSIONS.INCOME_VIEW,
  expenses: PERMISSIONS.EXPENSE_VIEW,
  profit: PERMISSIONS.FINANCE_VIEW,
  gamification: PERMISSIONS.GAMIFICATION_VIEW,
};

async function assertReportAccess(req: Request, type: ReportType): Promise<void> {
  const required = EXTRA_PERMISSION[type];
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
