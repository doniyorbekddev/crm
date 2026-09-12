import type { PersonRef } from './lead';

export type AlertType =
  | 'HIGH_DEBT'
  | 'LOW_ATTENDANCE'
  | 'HIGH_DROPOUT'
  | 'OVERDUE_FOLLOWUPS'
  | 'UNPAID_SALARY'
  | 'BUDGET_EXCEEDED'
  | 'LOW_GROUP_CAPACITY'
  | 'SALES_TARGET_ACHIEVED';
export type AlertSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
export type AlertStatusFilter = 'open' | 'resolved' | 'all';
export type TargetType = 'LEADS' | 'SALES' | 'REVENUE';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: PersonRef | null;
}

export interface AlertSummary {
  open: number;
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
