import type { PersonRef } from './lead';
import type { PaymentMethod } from './payment';
import type { GroupStatus, WeekDay } from './group';
import type { UserStatus } from './auth';

export type SalaryType = 'FIXED' | 'PER_LESSON' | 'PER_STUDENT' | 'PERCENTAGE' | 'MIXED';
export type SalaryPeriodStatus = 'PENDING' | 'CALCULATED' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID';

export interface SalaryRule {
  id: string;
  type: SalaryType;
  baseSalary: number;
  perLessonRate: number;
  perStudentRate: number;
  percentage: number;
  bonus: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  createdBy: PersonRef | null;
}

export interface TeacherItem {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: UserStatus;
    roleName: string;
  };
  specialization: string | null;
  experienceYears: number | null;
  hireDate: string | null;
  bio: string | null;
  isActive: boolean;
  groups: number;
  students: number;
  lessonsThisMonth: number;
  salaryRule: SalaryRule | null;
  /** false — xodimda salary.view ruxsati yo‘q, maosh ma’lumotlari qaytarilmagan */
  salaryVisible: boolean;
  createdAt: string;
}

export interface TeacherGroup {
  id: string;
  name: string;
  status: GroupStatus;
  room: string | null;
  scheduleDays: WeekDay[];
  startTime: string;
  endTime: string;
  students: number;
  course: { id: string; name: string };
}

export interface TeacherPerformance {
  year: number;
  month: number;
  label: string;
  lessonsHeld: number;
  lessonsPlanned: number;
  lessonsCancelled: number;
  attendance: { present: number; absent: number; late: number; excused: number; total: number };
  attendanceRate: number;
  homework: number;
  exams: number;
  revenue: number;
}

export interface SalaryPayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note: string | null;
  account: { id: string; name: string } | null;
  createdBy: PersonRef | null;
}

export interface SalaryPeriod {
  id: string;
  year: number;
  month: number;
  /** "2026-yil sentabr" */
  label: string;
  teacher: {
    profileId: string;
    userId: string;
    firstName: string;
    lastName: string;
    specialization: string | null;
  };
  salaryType: SalaryType;
  lessonsCount: number;
  studentsCount: number;
  groupRevenue: number;
  baseAmount: number;
  lessonAmount: number;
  studentAmount: number;
  percentageAmount: number;
  bonus: number;
  penalty: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: SalaryPeriodStatus;
  note: string | null;
  calculatedAt: string | null;
  approvedAt: string | null;
  approvedBy: PersonRef | null;
  lockedAt: string | null;
  payments: SalaryPayment[];
}

export interface TeacherDetail extends TeacherItem {
  groupList: TeacherGroup[];
  performance: TeacherPerformance;
  salaryRules: SalaryRule[];
  salaryPeriods: SalaryPeriod[];
  salaryTotals: { year: number; paid: number; remaining: number } | null;
}

export interface MyTeaching {
  profile: {
    id: string;
    specialization: string | null;
    experienceYears: number | null;
    hireDate: string | null;
    isActive: boolean;
  };
  groupList: TeacherGroup[];
  performance: TeacherPerformance;
  salaryRule: SalaryRule | null;
  salaryPeriods: SalaryPeriod[];
  salaryTotals: { year: number; paid: number; remaining: number };
}

export interface TeacherCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
}

export interface TeacherListParams {
  page: number;
  limit: number;
  search?: string;
  isActive?: 'true' | 'false';
  salaryType?: SalaryType;
  sortBy?: 'name' | 'hireDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TeacherProfilePayload {
  specialization?: string;
  experienceYears?: number;
  hireDate?: string;
  bio?: string;
  isActive?: boolean;
}

export interface CreateTeacherPayload extends TeacherProfilePayload {
  userId: string;
}

export interface SalaryRulePayload {
  type: SalaryType;
  baseSalary: number;
  perLessonRate: number;
  perStudentRate: number;
  percentage: number;
  bonus: number;
  effectiveFrom: string;
  note?: string;
}

export interface SalaryPeriodParams {
  year: number;
  month: number;
  teacherProfileId?: string;
  status?: SalaryPeriodStatus;
}

export interface SalarySummary {
  year: number;
  month: number;
  label: string;
  periods: number;
  awaitingApproval: number;
  accrued: number;
  paid: number;
  remaining: number;
  byStatus: Array<{ status: SalaryPeriodStatus; count: number; total: number }>;
}

export interface CalculateSalaryResult {
  year: number;
  month: number;
  calculated: number;
  skipped: Array<{ teacherProfileId: string; firstName: string; lastName: string; reason: string }>;
  total: number;
}

export interface SalaryPaymentPayload {
  amount: number;
  method: PaymentMethod;
  accountId?: string;
  paidAt?: string;
  note?: string;
}

export interface SalaryAdjustPayload {
  bonus?: number;
  penalty?: number;
  note?: string;
}

export interface SalaryFormLookups {
  accounts: Array<{ id: string; key: string; name: string; type: string; balance: number }>;
}
