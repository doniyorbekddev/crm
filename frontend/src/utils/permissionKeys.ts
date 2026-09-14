/** Backend’dagi ro‘yxat bilan bir xil: backend/src/config/permissions.ts */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  LEAD_VIEW: 'lead.view',
  LEAD_VIEW_ALL: 'lead.view_all',
  LEAD_CREATE: 'lead.create',
  LEAD_UPDATE: 'lead.update',
  LEAD_ASSIGN: 'lead.assign',
  LEAD_DELETE: 'lead.delete',

  CALL_VIEW: 'call.view',
  CALL_CREATE: 'call.create',
  CALL_UPDATE: 'call.update',
  CALL_DELETE: 'call.delete',

  FOLLOWUP_VIEW: 'followup.view',
  FOLLOWUP_CREATE: 'followup.create',
  FOLLOWUP_UPDATE: 'followup.update',
  FOLLOWUP_DELETE: 'followup.delete',

  COURSE_VIEW: 'course.view',
  COURSE_MANAGE: 'course.manage',

  GROUP_VIEW: 'group.view',
  GROUP_MANAGE: 'group.manage',

  STUDENT_VIEW: 'student.view',
  STUDENT_MANAGE: 'student.manage',
  STUDENT_CONVERT: 'student.convert',

  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MARK: 'attendance.mark',

  PAYMENT_VIEW: 'payment.view',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_DELETE: 'payment.delete',
  PAYMENT_REFUND: 'payment.refund',

  DEBT_VIEW: 'debt.view',

  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',

  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',

  ROLE_MANAGE: 'role.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',

  // --- O'quv markaz modullari ---
  TEACHER_VIEW: 'teacher.view',
  TEACHER_MANAGE: 'teacher.manage',

  SALARY_VIEW: 'salary.view',
  COMMISSION_VIEW_OWN: 'commission.view_own',
  SALARY_UNLOCK: 'salary.unlock',
  EMPLOYEE_VIEW: 'employee.view',
  EMPLOYEE_MANAGE: 'employee.manage',
  SALARY_CALCULATE: 'salary.calculate',
  SALARY_APPROVE: 'salary.approve',
  SALARY_PAY: 'salary.pay',

  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  FINANCE_CLOSE: 'finance.close',
  FINANCE_REOPEN: 'finance.reopen',
  INCOME_VIEW: 'income.view',
  INCOME_MANAGE: 'income.manage',
  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',
  EXPENSE_APPROVE: 'expense.approve',
  BUDGET_MANAGE: 'budget.manage',

  GAMIFICATION_VIEW: 'gamification.view',
  GAMIFICATION_MANAGE: 'gamification.manage',

  HOMEWORK_VIEW: 'homework.view',
  HOMEWORK_MANAGE: 'homework.manage',
  HOMEWORK_GRADE: 'homework.grade',

  EXAM_VIEW: 'exam.view',
  EXAM_MANAGE: 'exam.manage',
  EXAM_GRADE: 'exam.grade',

  PARENT_VIEW: 'parent.view',
  PARENT_MANAGE: 'parent.manage',

  ALERT_VIEW: 'alert.view',
  ALERT_MANAGE: 'alert.manage',
  STAFF_DOCUMENT_VIEW: 'staff_document.view',
  STAFF_DOCUMENT_MANAGE: 'staff_document.manage',
  TARGET_VIEW: 'target.view',
  TARGET_MANAGE: 'target.manage',

  ANALYTICS_VIEW: 'analytics.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SUPER_ADMIN_ROLE_KEY = 'SUPER_ADMIN';
export const OWNER_ROLE_KEY = 'OWNER';

/** Butun markaz ko‘rsatkichlarini ko‘ra oladigan rollar */
export const EXECUTIVE_ROLE_KEYS: readonly string[] = [SUPER_ADMIN_ROLE_KEY, OWNER_ROLE_KEY];
