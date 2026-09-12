import type { LeadStatus } from './lead';

export type ChartPeriod = 'day' | 'week' | 'month';
export type ManagerPeriod = 'month' | 'quarter' | 'year';

export interface DashboardLeadsBlock {
  todayNew: number;
  monthNew: number;
  open: number;
  monthWon: number;
  monthLost: number;
  conversionRate: number;
}

export interface DashboardStudentsBlock {
  active: number;
  monthNew: number;
  frozen: number;
}

export interface DashboardFinanceBlock {
  todayRevenue: number;
  monthRevenue: number;
  prevMonthRevenue: number;
  monthGrowth: number;
}

export interface DashboardDebtBlock {
  totalRemaining: number;
  debtors: number;
}

export interface DashboardTasksBlock {
  todayFollowUps: number;
  overdueFollowUps: number;
  todayCalls: number;
}

export interface DashboardSummary {
  date: string;
  leads: DashboardLeadsBlock | null;
  students: DashboardStudentsBlock | null;
  finance: DashboardFinanceBlock | null;
  debts: DashboardDebtBlock | null;
  tasks: DashboardTasksBlock | null;
}

export interface ChartPoint {
  date: string;
  label: string;
  leads: number;
  won: number;
  revenue: number;
}

export interface FunnelStage {
  status: LeadStatus;
  count: number;
  percent: number;
}

export interface ManagerStats {
  id: string;
  firstName: string;
  lastName: string;
  roleName: string;
  leads: number;
  won: number;
  conversionRate: number;
  revenue: number;
}

export interface DashboardFollowUp {
  id: string;
  dueAt: string;
  title: string;
  notes: string | null;
  overdue: boolean;
  lead: { id: string; code: string; firstName: string; lastName: string | null; phone: string };
}
