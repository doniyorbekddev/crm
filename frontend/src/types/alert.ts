import type { PersonRef } from './lead';

export type AlertType =
  | 'HIGH_DEBT'
  | 'LOW_ATTENDANCE'
  | 'HIGH_DROPOUT'
  | 'OVERDUE_FOLLOWUPS'
  | 'UNPAID_SALARY'
  | 'BUDGET_EXCEEDED'
  | 'LOW_GROUP_CAPACITY'
  | 'SALES_TARGET_ACHIEVED'
  | 'CONVERSION_DROP'
  | 'DROPOUT_INCREASE'
  | 'CASH_SHORTAGE'
  | 'PENDING_EXPENSE_APPROVAL'
  | 'DOCUMENT_EXPIRING'
  | 'PAYMENT_OVERDUE'
  | 'ACADEMIC_RISK';
export type AlertSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
/** Kritik — yuqori, ogohlantirish — o‘rta, ma’lumot va yutuq — past */
export type AlertPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatusFilter = 'open' | 'unread' | 'resolved' | 'all';
export type TargetType = 'LEADS' | 'SALES' | 'REVENUE';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  priority: AlertPriority;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  readAt: string | null;
  readBy: PersonRef | null;
  resolvedAt: string | null;
  resolvedBy: PersonRef | null;
}

export interface AlertSummary {
  open: number;
  unread: number;
  bySeverity: Record<AlertSeverity, number>;
  byType: Array<{ type: AlertType; count: number }>;
}

export interface AlertListParams {
  page: number;
  limit: number;
  search?: string;
  status?: AlertStatusFilter;
  type?: AlertType;
  severity?: AlertSeverity;
}

export interface EvaluateResult {
  created: number;
  updated: number;
  resolved: number;
  open: number;
}

export interface TargetCell {
  id: string | null;
  target: number;
  actual: number;
  progress: number;
}

export interface TargetRow {
  userId: string;
  firstName: string;
  lastName: string;
  roleName: string;
  targets: Record<TargetType, TargetCell>;
}

export interface TargetOverview {
  year: number;
  month: number;
  label: string;
  canManage: boolean;
  rows: TargetRow[];
  totals: Record<TargetType, { target: number; actual: number; progress: number }>;
}

export interface SaveTargetPayload {
  year: number;
  month: number;
  userId: string;
  type: TargetType;
  targetValue: number;
}

export interface AlertSettings {
  rules: Record<AlertType, boolean>;
  debtSharePercent: number;
  debtGraceDays: number;
  dropoutAbsences: number;
  attendanceWarning: number;
  attendanceCritical: number;
  followUpWarning: number;
  followUpCritical: number;
  salaryGraceDays: number;
  capacityPercent: number;
  conversionDropPoints: number;
  dropoutIncreasePercent: number;
  dropoutIncreaseMin: number;
  expenseApprovalDays: number;
  documentExpiryDays: number;
  paymentOverdueDays: number;
  digestEnabled: boolean;
  digestHour: number;
  updatedAt: string | null;
}

export type AlertNumericSetting = Exclude<keyof AlertSettings, 'rules' | 'digestEnabled' | 'updatedAt'>;

export type AlertSettingsPayload = Partial<Pick<AlertSettings, AlertNumericSetting | 'digestEnabled'>> & {
  rules?: Partial<Record<AlertType, boolean>>;
};

export interface DailyDigest {
  date: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  newStudents: number;
  newLeads: number;
  wonLeads: number;
  attendanceRate: number | null;
  attendanceMarks: number;
  totalDebt: number;
  debtors: number;
  openAlerts: number;
  criticalAlerts: number;
  importantAlerts: Array<{ id: string; title: string; severity: AlertSeverity }>;
}
