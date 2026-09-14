import type { AlertListParams } from '@/types/alert';
import type { AnalyticsRangeParams, ProfitabilityDimension } from '@/types/analytics';
import type { AuditListParams } from '@/types/audit';
import type { LeaderboardParams } from '@/types/gamification';
import type { AttendanceRankingParams, AttendanceStatsParams, SessionListParams } from '@/types/attendanceAnalytics';
import type { CallListParams } from '@/types/call';
import type { ChartPeriod, ExecutiveParams, ManagerPeriod } from '@/types/dashboard';
import type { CommissionParams } from '@/types/commission';
import type { CourseListParams } from '@/types/course';
import type { EmployeeListParams } from '@/types/employee';
import type { GroupListParams } from '@/types/group';
import type { FollowUpListParams } from '@/types/followUp';
import type { LeadFilters, LeadListParams } from '@/types/lead';
import type { DebtListParams, DebtSummaryParams, PaymentListParams, PaymentStatsParams } from '@/types/payment';
import type { NotificationListParams } from '@/types/notification';
import type { ParentListParams } from '@/types/parent';
import type { ReportParams, ReportType } from '@/types/report';
import type { StudentListParams, StudentSummaryParams } from '@/types/student';
import type { SalaryPeriodParams, TeacherListParams } from '@/types/teacher';
import type { CashFlowParams, FinanceRangeParams, MoneyListParams, TransactionListParams } from '@/types/finance';
import type { ExamListParams, HomeworkListParams } from '@/types/homework';
import type { UserListParams, UserSummaryParams } from '@/types/user';

/** React Query kalitlari bir joyda — invalidatsiya aniq va xatosiz bo‘lishi uchun. */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: ['dashboard', 'summary'] as const,
    executive: ['dashboard', 'executive'] as const,
    executivePeriod: (params: ExecutiveParams) => ['dashboard', 'executive', params] as const,
    charts: (period: ChartPeriod) => ['dashboard', 'charts', period] as const,
    funnel: ['dashboard', 'funnel'] as const,
    followUps: ['dashboard', 'follow-ups'] as const,
    managers: (period: ManagerPeriod) => ['dashboard', 'managers', period] as const,
  },
  users: {
    all: ['users'] as const,
    list: (params: UserListParams) => ['users', 'list', params] as const,
    summary: (params: UserSummaryParams) => ['users', 'summary', params] as const,
  },
  roles: {
    all: ['roles'] as const,
    list: ['roles', 'list'] as const,
    permissions: ['roles', 'permissions'] as const,
  },
  leads: {
    all: ['leads'] as const,
    list: (params: LeadListParams) => ['leads', 'list', params] as const,
    summary: (filters: LeadFilters) => ['leads', 'summary', filters] as const,
    kanban: (filters: LeadFilters) => ['leads', 'kanban', filters] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
    activities: (id: string) => ['leads', 'activities', id] as const,
    notes: (id: string) => ['leads', 'notes', id] as const,
  },
  calls: {
    all: ['calls'] as const,
    list: (params: CallListParams) => ['calls', 'list', params] as const,
  },
  followUps: {
    all: ['follow-ups'] as const,
    list: (params: FollowUpListParams) => ['follow-ups', 'list', params] as const,
    summary: (params: { assignedTo?: string; leadId?: string }) => ['follow-ups', 'summary', params] as const,
  },
  courses: {
    all: ['courses'] as const,
    list: (params: CourseListParams) => ['courses', 'list', params] as const,
  },
  groups: {
    all: ['groups'] as const,
    list: (params: GroupListParams) => ['groups', 'list', params] as const,
  },
  students: {
    all: ['students'] as const,
    list: (params: StudentListParams) => ['students', 'list', params] as const,
    summary: (params: StudentSummaryParams) => ['students', 'summary', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    attendance: (id: string) => ['students', 'attendance', id] as const,
    profile: (id: string) => ['students', 'profile', id] as const,
    homework: (id: string) => ['students', 'homework', id] as const,
    exams: (id: string) => ['students', 'exams', id] as const,
    parents: (id: string) => ['students', 'parents', id] as const,
  },
  parents: {
    all: ['parents'] as const,
    list: (params: ParentListParams) => ['parents', 'list', params] as const,
  },
  attendance: {
    all: ['attendance'] as const,
    sheet: (groupId: string, date: string) => ['attendance', 'sheet', groupId, date] as const,
    stats: (params: AttendanceStatsParams) => ['attendance', 'stats', params] as const,
    ranking: (params: AttendanceRankingParams) => ['attendance', 'ranking', params] as const,
    teacherOverview: ['attendance', 'teacher-overview'] as const,
    calendar: (studentId: string, year: number, month: number) => ['attendance', 'calendar', studentId, year, month] as const,
    sessions: (params: SessionListParams) => ['attendance', 'sessions', params] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: (params: PaymentListParams) => ['payments', 'list', params] as const,
    stats: (params: PaymentStatsParams) => ['payments', 'stats', params] as const,
  },
  debts: {
    all: ['debts'] as const,
    list: (params: DebtListParams) => ['debts', 'list', params] as const,
    summary: (params: DebtSummaryParams) => ['debts', 'summary', params] as const,
  },
  reports: {
    all: ['reports'] as const,
    build: (type: ReportType, params: ReportParams) => ['reports', type, params] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (params: NotificationListParams) => ['notifications', 'list', params] as const,
    summary: ['notifications', 'summary'] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (params: AuditListParams) => ['audit', 'list', params] as const,
    filters: ['audit', 'filters'] as const,
  },
  search: {
    all: ['search'] as const,
    query: (term: string) => ['search', term] as const,
  },
  gamification: {
    all: ['gamification'] as const,
    leaderboard: (params: LeaderboardParams) => ['gamification', 'leaderboard', params] as const,
    profile: (studentId: string) => ['gamification', 'profile', studentId] as const,
    rules: ['gamification', 'rules'] as const,
    levels: ['gamification', 'levels'] as const,
    badges: ['gamification', 'badges'] as const,
  },
  teachers: {
    all: ['teachers'] as const,
    list: (params: TeacherListParams) => ['teachers', 'list', params] as const,
    detail: (id: string) => ['teachers', 'detail', id] as const,
    candidates: ['teachers', 'candidates'] as const,
    me: ['teachers', 'me'] as const,
    salaryRules: (id: string) => ['teachers', 'salary-rules', id] as const,
  },
  employees: {
    all: ['employees'] as const,
    list: (params: EmployeeListParams) => ['employees', 'list', params] as const,
    candidates: ['employees', 'candidates'] as const,
  },
  commissions: {
    all: ['commissions'] as const,
    list: (params: CommissionParams) => ['commissions', 'list', params] as const,
    detail: (id: string, params: CommissionParams) => ['commissions', 'detail', id, params] as const,
    mine: (params: CommissionParams) => ['commissions', 'mine', params] as const,
  },
  salaries: {
    all: ['salaries'] as const,
    periods: (params: SalaryPeriodParams) => ['salaries', 'periods', params] as const,
    summary: (params: { year: number; month: number }) => ['salaries', 'summary', params] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (params: AlertListParams) => ['alerts', 'list', params] as const,
    summary: ['alerts', 'summary'] as const,
    settings: ['alerts', 'settings'] as const,
    digest: ['alerts', 'digest'] as const,
  },
  targets: {
    all: ['targets'] as const,
    overview: (year: number, month: number) => ['targets', year, month] as const,
  },
  homework: {
    all: ['homework'] as const,
    list: (params: HomeworkListParams) => ['homework', 'list', params] as const,
    detail: (id: string) => ['homework', 'detail', id] as const,
  },
  exams: {
    all: ['exams'] as const,
    list: (params: ExamListParams) => ['exams', 'list', params] as const,
    detail: (id: string) => ['exams', 'detail', id] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    unitEconomics: (params: AnalyticsRangeParams) => ['analytics', 'unit-economics', params] as const,
    profitability: (params: AnalyticsRangeParams & { dimension: ProfitabilityDimension }) => ['analytics', 'profitability', params] as const,
    cohorts: (months: number) => ['analytics', 'cohorts', months] as const,
    sources: (params: AnalyticsRangeParams) => ['analytics', 'sources', params] as const,
  },
  finance: {
    all: ['finance'] as const,
    summary: (params: FinanceRangeParams) => ['finance', 'summary', params] as const,
    cashFlow: (params: CashFlowParams) => ['finance', 'cash-flow', params] as const,
    cashFlowStatement: (params: FinanceRangeParams) => ['finance', 'cash-flow-statement', params] as const,
    profitLoss: (params: FinanceRangeParams) => ['finance', 'profit-loss', params] as const,
    accounts: (params: FinanceRangeParams) => ['finance', 'accounts', params] as const,
    transactions: (params: TransactionListParams) => ['finance', 'transactions', params] as const,
    budget: (params: { year: number; month: number }) => ['finance', 'budget', params] as const,
    periods: (year: number) => ['finance', 'periods', year] as const,
  },
  incomes: {
    all: ['incomes'] as const,
    list: (params: MoneyListParams) => ['incomes', 'list', params] as const,
    stats: (params: Omit<MoneyListParams, 'page' | 'limit'>) => ['incomes', 'stats', params] as const,
    categories: ['incomes', 'categories'] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    list: (params: MoneyListParams) => ['expenses', 'list', params] as const,
    stats: (params: Omit<MoneyListParams, 'page' | 'limit'>) => ['expenses', 'stats', params] as const,
    categories: ['expenses', 'categories'] as const,
    approvalSettings: ['expenses', 'approval-settings'] as const,
    recurring: ['expenses', 'recurring'] as const,
  },
  lookups: {
    leadForm: ['lookups', 'lead-form'] as const,
    groupForm: ['lookups', 'group-form'] as const,
    studentForm: ['lookups', 'student-form'] as const,
    paymentForm: ['lookups', 'payment-form'] as const,
    salaryForm: ['lookups', 'salary-form'] as const,
  },
};
