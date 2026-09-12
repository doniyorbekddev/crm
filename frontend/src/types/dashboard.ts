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

export interface ExecutiveKpi {
  totalStudents: number;
  activeStudents: number;
  newStudents: number;
  droppedStudents: number;
  totalGroups: number;
  activeGroups: number;
  totalTeachers: number;
  monthRevenue: number;
  monthExpense: number;
  netProfit: number;
  totalDebt: number;
  attendanceRate: number;
  salesConversion: number;
}

export interface ExecutiveToday {
  date: string;
  newLeads: number;
  newStudents: number;
  trialLessons: number;
  lessons: number;
  markedLessons: number;
  attendanceRate: number;
  absentStudents: number;
  payments: number;
  expenses: number;
  netRevenue: number;
  activeGroups: number;
  activeTeachers: number;
}

export interface ExecutiveMonth {
  year: number;
  month: number;
  label: string;
  revenue: number;
  expense: number;
  netProfit: number;
  margin: number;
  newLeads: number;
  wonLeads: number;
  conversionRate: number;
  newStudents: number;
  droppedStudents: number;
  activeStudents: number;
  totalDebt: number;
  salaryAccrued: number;
  salaryPaid: number;
  attendanceRate: number;
}

export interface ExecutiveTrendPoint {
  date: string;
  label: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface ExecutiveSummary {
  kpi: ExecutiveKpi;
  today: ExecutiveToday;
  month: ExecutiveMonth;
  trend: ExecutiveTrendPoint[];
  attention: Array<{ key: string; label: string; value: number; tone: 'warning' | 'danger' }>;
}
