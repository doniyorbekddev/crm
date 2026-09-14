import type { PersonRef } from './lead';
import type { PaymentMethod } from './payment';
import type { GroupStatus, WeekDay } from './group';
import type { UserStatus } from './auth';
import type { EmployeeStatus } from './employee';

export type SalaryType = 'FIXED' | 'PER_LESSON' | 'PER_STUDENT' | 'PERCENTAGE' | 'MIXED';
export type SalaryPeriodStatus = 'PENDING' | 'CALCULATED' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID';
export type SalaryPaymentKind = 'SALARY' | 'ADVANCE';
export type PayeeType = 'TEACHER' | 'EMPLOYEE';

export interface PayeeRef {
  type: PayeeType;
  /** teacherProfileId yoki employeeId */
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  /** Mutaxassislik yoki lavozim */
  subtitle: string | null;
}
export type PayrollAdjustmentType = 'BONUS' | 'PENALTY';
export type PayrollAdjustmentCategory =
  | 'ATTENDANCE'
  | 'RETENTION'
  | 'PERFORMANCE'
  | 'MONTHLY'
  | 'SPECIAL'
  | 'LATENESS'
  | 'ABSENCE'
  | 'DISCIPLINE'
  | 'OTHER';

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
  /** HR holati */
  employmentStatus: EmployeeStatus;
  terminationDate: string | null;
  documents: number;
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
  kind: SalaryPaymentKind;
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
  payee: PayeeRef;
  teacher: {
    profileId: string;
    userId: string;
    firstName: string;
    lastName: string;
    specialization: string | null;
  } | null;
  employee: { id: string; firstName: string; lastName: string; position: string } | null;
  salaryType: SalaryType;
  lessonsCount: number;
  studentsCount: number;
  groupRevenue: number;
  baseAmount: number;
  lessonAmount: number;
  studentAmount: number;
  percentageAmount: number;
  commissionRate: number;
  modelBonus: number;
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
  unlockedAt: string | null;
  unlockedBy: PersonRef | null;
  unlockReason: string | null;
  adjustments: PayrollAdjustment[];
  payments: SalaryPayment[];
}

export interface PayrollAdjustment {
  id: string;
  type: PayrollAdjustmentType;
  category: PayrollAdjustmentCategory;
  amount: number;
  reason: string;
  date: string;
  createdAt: string;
  createdBy: PersonRef | null;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: PersonRef | null;
}

export interface PayrollAdjustmentPayload {
  teacherProfileId?: string;
  employeeId?: string;
  year: number;
  month: number;
  type: PayrollAdjustmentType;
  category: PayrollAdjustmentCategory;
  amount: number;
  reason: string;
  date: string;
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
  employmentStatus?: EmployeeStatus;
  sortBy?: 'name' | 'hireDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TeacherProfilePayload {
  specialization?: string;
  experienceYears?: number;
  hireDate?: string;
  bio?: string;
  isActive?: boolean;
  employmentStatus?: EmployeeStatus;
  terminationDate?: string;
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
  payeeType?: PayeeType;
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
  kind?: SalaryPaymentKind;
  amount: number;
  method: PaymentMethod;
  accountId?: string;
  paidAt?: string;
  note?: string;
}

export interface SalaryAdjustPayload {
  note: string;
}

export interface SalaryFormLookups {
  accounts: Array<{ id: string; key: string; name: string; type: string; balance: number }>;
}
