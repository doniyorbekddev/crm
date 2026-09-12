import type { AuditListParams } from '@/types/audit';
import type { LeaderboardParams } from '@/types/gamification';
import type { AttendanceRankingParams, AttendanceStatsParams, SessionListParams } from '@/types/attendanceAnalytics';
import type { CallListParams } from '@/types/call';
import type { ChartPeriod, ManagerPeriod } from '@/types/dashboard';
import type { CourseListParams } from '@/types/course';
import type { GroupListParams } from '@/types/group';
import type { FollowUpListParams } from '@/types/followUp';
import type { LeadFilters, LeadListParams } from '@/types/lead';
import type { DebtListParams, DebtSummaryParams, PaymentListParams, PaymentStatsParams } from '@/types/payment';
import type { NotificationListParams } from '@/types/notification';
import type { ReportParams, ReportType } from '@/types/report';
import type { StudentListParams, StudentSummaryParams } from '@/types/student';
import type { SalaryPeriodParams, TeacherListParams } from '@/types/teacher';
import type { UserListParams, UserSummaryParams } from '@/types/user';

/** React Query kalitlari bir joyda — invalidatsiya aniq va xatosiz bo‘lishi uchun. */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: ['dashboard', 'summary'] as const,
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
  salaries: {
    all: ['salaries'] as const,
    periods: (params: SalaryPeriodParams) => ['salaries', 'periods', params] as const,
    summary: (params: { year: number; month: number }) => ['salaries', 'summary', params] as const,
  },
  lookups: {
    leadForm: ['lookups', 'lead-form'] as const,
    groupForm: ['lookups', 'group-form'] as const,
    studentForm: ['lookups', 'student-form'] as const,
    paymentForm: ['lookups', 'payment-form'] as const,
    salaryForm: ['lookups', 'salary-form'] as const,
  },
};
