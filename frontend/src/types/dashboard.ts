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

export interface DashboardTeachingBlock {
  groups: number;
  students: number;
  todayLessons: number;
  markedLessons: number;
  todayAbsent: number;
  monthAttendanceRate: number;
  pendingGrading: number;
  upcomingExams: number;
}

export interface DashboardMoneyBlock {
  monthIncome: number;
  monthExpense: number;
  monthNetProfit: number;
  cashBalance: number;
  salaryDue: number | null;
  salaryAwaitingApproval: number | null;
}

export interface DashboardSummary {
  date: string;
  leads: DashboardLeadsBlock | null;
  students: DashboardStudentsBlock | null;
  finance: DashboardFinanceBlock | null;
  debts: DashboardDebtBlock | null;
  tasks: DashboardTasksBlock | null;
  /** O‘qituvchi uchun (dars beradigan xodim) */
  teaching: DashboardTeachingBlock | null;
  /** Moliya ruxsati bo‘lsa */
  money: DashboardMoneyBlock | null;
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
  /** Lead shu bosqichga kelishi uchun o‘rtacha necha kun ketgani (ma’lumot yetmasa null) */
  avgDaysToReach: number | null;
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

export interface ExecutiveMetrics {
  revenue: number;
  expense: number;
  netProfit: number;
  margin: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  newStudents: number;
  droppedStudents: number;
  attendanceRate: number;
  attendanceMarks: number;
}

export interface ExecutiveMonth extends ExecutiveMetrics {
  year: number;
  month: number;
  label: string;
  activeStudents: number;
  totalDebt: number;
  salaryAccrued: number;
  salaryPaid: number;
}

export interface ExecutivePeriod {
  kind: 'current-month' | 'month' | 'range';
  from: string;
  to: string;
  label: string;
  previousFrom: string;
  previousTo: string;
}

export type ExecutiveChangeKey =
  | 'revenue'
  | 'expense'
  | 'netProfit'
  | 'newLeads'
  | 'wonLeads'
  | 'newStudents'
  | 'droppedStudents'
  | 'margin'
  | 'conversionRate'
  | 'attendanceRate';

export type HealthStatus = 'GOOD' | 'FAIR' | 'POOR' | 'NO_DATA';

export interface ExecutiveHealth {
  score: number | null;
  status: HealthStatus;
  components: Array<{ key: string; label: string; score: number | null; weight: number; value: string; hint: string }>;
}

export interface ExecutiveInsight {
  key: string;
  tone: 'positive' | 'negative' | 'neutral';
  text: string;
}

export interface ExecutiveForecast {
  daysElapsed: number;
  daysInMonth: number;
  projectedRevenue: number;
  projectedExpense: number;
  upcomingExpenses: number;
  projectedProfit: number;
  revenueTarget: number;
  targetProgress: number | null;
}

export interface ExecutiveParams {
  year?: number;
  month?: number;
  from?: string;
  to?: string;
}

export interface ExecutiveTrendPoint {
  date: string;
  label: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface ExecutiveSummary {
  period: ExecutivePeriod;
  kpi: ExecutiveKpi;
  today: ExecutiveToday;
  month: ExecutiveMonth;
  previous: ExecutiveMetrics;
  /** Summalar — foizda, marja/konversiya/davomat — foiz punktida; null — oldingi davr bo‘sh */
  changes: Record<ExecutiveChangeKey, number | null>;
  health: ExecutiveHealth;
  insights: ExecutiveInsight[];
  forecast: ExecutiveForecast | null;
  trend: ExecutiveTrendPoint[];
  attention: Array<{ key: string; label: string; value: number; tone: 'warning' | 'danger' }>;
}

/** TZ 3.0 §76 — rahbar panelidagi akademiya holati (oxirgi `windowDays` kun) */
export interface AcademyOverview {
  windowDays: number;
  parents: { total: number; withPortal: number; telegramLinked: number };
  courses: { active: number };
  groups: { active: number; planned: number };
  attendance: { rate: number | null; marked: number };
  homework: { open: number; toGrade: number; submissionRate: number | null };
  exams: { held: number; averagePercentage: number | null; needsReview: number };
  progress: { averageMastery: number | null; masteredShare: number | null; tracked: number };
  risk: { healthy: number; attention: number; atRisk: number; critical: number };
  marketing: { leads: number; won: number; topSource: { name: string; leads: number } | null };
  telegram: { linkedChats: number; queued: number; failed: number };
  ai: { mode: 'LLM' | 'RULES'; analyses: number; awaitingDecision: number };
}
