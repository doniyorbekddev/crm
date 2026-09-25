import type { ActivityParams } from '@/types/activity';
import type { AlertListParams } from '@/types/alert';
import type { AnalyticsRangeParams, ProfitabilityDimension } from '@/types/analytics';
import type { AuditListParams } from '@/types/audit';
import type { LeaderboardParams } from '@/types/gamification';
import type { AttendanceRankingParams, AttendanceStatsParams, SessionListParams } from '@/types/attendanceAnalytics';
import type { ReferralListParams } from '@/types/referral';
import type { FeedbackListParams } from '@/types/feedback';
import type { MovementListParams, ProductListParams } from '@/types/inventory';
import type { AutomationRunParams } from '@/types/automation';
import type { IntentListParams } from '@/types/onlinePayment';
import type { LeaveListParams } from '@/types/employee';
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
    score: (id: string) => ['leads', 'score', id] as const,
    assignmentRules: ['leads', 'assignment-rules'] as const,
  },
  onlinePayments: {
    all: ['online-payments'] as const,
    providers: ['online-payments', 'providers'] as const,
    list: (params: IntentListParams) => ['online-payments', 'list', params] as const,
  },
  automation: {
    all: ['automation'] as const,
    list: ['automation', 'list'] as const,
    runs: (params: AutomationRunParams) => ['automation', 'runs', params] as const,
  },
  ai: {
    all: ['ai'] as const,
    tools: ['ai', 'tools'] as const,
    history: ['ai', 'history'] as const,
  },
  branches: {
    all: ['branches'] as const,
    list: ['branches', 'list'] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    list: (params: ProductListParams) => ['inventory', 'list', params] as const,
    stats: ['inventory', 'stats'] as const,
    categories: (includeInactive: boolean) => ['inventory', 'categories', includeInactive] as const,
    movements: (params: MovementListParams) => ['inventory', 'movements', params] as const,
  },
  feedback: {
    all: ['feedback'] as const,
    list: (params: FeedbackListParams) => ['feedback', 'list', params] as const,
    stats: (params: { teacherId?: string; months?: number }) => ['feedback', 'stats', params] as const,
    portal: (studentId: string | undefined) => ['feedback', 'portal', studentId] as const,
  },
  discounts: {
    all: ['discounts'] as const,
    settings: ['discounts', 'settings'] as const,
    rules: (includeInactive: boolean) => ['discounts', 'rules', includeInactive] as const,
    promoCodes: (includeInactive: boolean) => ['discounts', 'promo-codes', includeInactive] as const,
    student: (studentId: string) => ['discounts', 'student', studentId] as const,
  },
  referrals: {
    all: ['referrals'] as const,
    list: (params: ReferralListParams) => ['referrals', 'list', params] as const,
    stats: ['referrals', 'stats'] as const,
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
  certificates: {
    all: ['certificates'] as const,
    list: (params: Record<string, unknown>) => ['certificates', 'list', params] as const,
    verify: (token: string) => ['certificates', 'verify', token] as const,
     detail: (id: string) => ['certificates', 'detail', id] as const,
  },
  questions: {
    all: ['questions'] as const,
    list: (params: Record<string, unknown>) => ['questions', 'list', params] as const,
    attempts: (examId: string) => ['questions', 'attempts', examId] as const,
  },
  lessons: {
    all: ['lessons'] as const,
    tree: (courseId: string, includeArchived: boolean) => ['lessons', 'tree', courseId, includeArchived] as const,
    detail: (id: string) => ['lessons', 'detail', id] as const,
  },
  curriculum: {
    all: ['curriculum'] as const,
    course: (courseId: string) => ['curriculum', 'course', courseId] as const,
    student: (studentId: string) => ['curriculum', 'student', studentId] as const,
  },
  rooms: {
    all: ['rooms'] as const,
    list: (includeInactive: boolean) => ['rooms', 'list', includeInactive] as const,
  },
  telegram: {
    all: ['telegram'] as const,
    me: ['telegram', 'me'] as const,
  },
  portal: {
    all: ['portal'] as const,
    me: ['portal', 'me'] as const,
    profile: (studentId: string) => ['portal', 'profile', studentId] as const,
    schedule: (studentId: string) => ['portal', 'schedule', studentId] as const,
    lessons: (studentId: string) => ['portal', 'lessons', studentId] as const,
    curriculum: (studentId: string) => ['portal', 'curriculum', studentId] as const,
    certificates: (studentId: string) => ['portal', 'certificates', studentId] as const,
    overview: (studentId: string) => ['portal', 'overview', studentId] as const,
    children: ['portal', 'children'] as const,
    weeklyReport: (studentId: string, week: string) => ['portal', 'weekly-report', studentId, week] as const,
    course: (studentId: string) => ['portal', 'course', studentId] as const,
    lesson: (studentId: string, lessonId: string) => ['portal', 'course', studentId, lessonId] as const,
    homework: (studentId: string) => ['portal', 'homework', studentId] as const,
    homeworkDetail: (studentId: string, homeworkId: string) => ['portal', 'homework', studentId, homeworkId] as const,
    exams: (studentId: string) => ['portal', 'exams', studentId] as const,
    mastery: (studentId: string) => ['portal', 'mastery', studentId] as const,
    availableExams: (studentId: string) => ['portal', 'exams', studentId, 'available'] as const,
    attempt: (attemptId: string) => ['portal', 'attempt', attemptId] as const,
    examDetail: (studentId: string, examId: string) => ['portal', 'exams', studentId, examId] as const,
    attendance: (studentId: string, year: number, month: number) => ['portal', 'attendance', studentId, year, month] as const,
    gamification: (studentId: string) => ['portal', 'gamification', studentId] as const,
    payments: (studentId: string) => ['portal', 'payments', studentId] as const,
  },
  students: {
    all: ['students'] as const,
    list: (params: StudentListParams) => ['students', 'list', params] as const,
    summary: (params: StudentSummaryParams) => ['students', 'summary', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
    risk: (id: string) => ['students', 'risk', id] as const,
    weeklyReport: (id: string, week: string) => ['students', 'weekly-report', id, week] as const,
    statusHistory: (id: string) => ['students', 'status-history', id] as const,
    atRisk: (limit: number) => ['students', 'at-risk', limit] as const,
    attendance: (id: string) => ['students', 'attendance', id] as const,
    profile: (id: string) => ['students', 'profile', id] as const,
    homework: (id: string) => ['students', 'homework', id] as const,
    exams: (id: string) => ['students', 'exams', id] as const,
    parents: (id: string) => ['students', 'parents', id] as const,
    paymentSchedule: (id: string) => ['students', 'payment-schedule', id] as const,
    groupHistory: (id: string) => ['students', 'group-history', id] as const,
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
    settings: ['notifications', 'settings'] as const,
  },
  preferences: ['preferences'] as const,
  activity: {
    all: ['activity'] as const,
    feed: (params: Omit<ActivityParams, 'cursor'>) => ['activity', 'feed', params] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (params: AuditListParams) => ['audit', 'list', params] as const,
    filters: ['audit', 'filters'] as const,
    settings: ['audit', 'settings'] as const,
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
    leaves: (params: LeaveListParams) => ['employees', 'leaves', params] as const,
    employeeLeaves: (id: string) => ['employees', 'leaves', 'employee', id] as const,
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
    submission: (id: string, studentId: string) => ['homework', 'submission', id, studentId] as const,
    rubrics: (includeInactive: boolean) => ['homework', 'rubrics', includeInactive] as const,
  },
  teaching: {
    all: ['teaching'] as const,
    overview: (teacherId: string) => ['teaching', 'overview', teacherId] as const,
    group: (id: string) => ['teaching', 'group', id] as const,
  },
  mastery: {
    all: ['mastery'] as const,
    student: (id: string) => ['mastery', 'student', id] as const,
    history: (id: string) => ['mastery', 'history', id] as const,
    group: (id: string) => ['mastery', 'group', id] as const,
    settings: ['mastery', 'settings'] as const,
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
    marketingSources: ['lookups', 'marketing-sources'] as const,
    paymentForm: ['lookups', 'payment-form'] as const,
    salaryForm: ['lookups', 'salary-form'] as const,
  },
};
