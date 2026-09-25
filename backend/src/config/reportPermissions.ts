import { PERMISSIONS } from './permissions.js';
import type { PermissionKey } from './permissions.js';
import type { ReportType } from '../validators/report.validator.js';

/**
 * Moliyaviy va xodimlarga oid hisobotlar uchun `report.view` yetarli emas —
 * tegishli modul ruxsati ham kerak (masalan, maoshni faqat salary.view egasi ko‘radi).
 * Web API va Telegram bot shu bitta ro'yxatdan foydalanadi.
 */
export const REPORT_EXTRA_PERMISSION: Partial<Record<ReportType, PermissionKey>> = {
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

export function canViewReport(permissions: ReadonlySet<string>, type: ReportType): boolean {
  if (!permissions.has(PERMISSIONS.REPORT_VIEW)) return false;
  const extra = REPORT_EXTRA_PERMISSION[type];
  return !extra || permissions.has(extra);
}
