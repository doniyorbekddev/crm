import type { StudentStatus } from '@/types/student';
import type { PaymentMethod } from '@/types/payment';
import type { ChargeStatus } from '@/types/paymentSchedule';

/** Qarzdorlik va oylik hisobot (oy majburiyatlari): backend `billing.service.ts` */

export interface BillingStudent {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  parentPhone: string | null;
  status: StudentStatus;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
  teacher: { id: string; firstName: string; lastName: string } | null;
}

export interface BillingFilterParams {
  groupId?: string;
  courseId?: string;
  teacherId?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

/** DEBT — muddati kelgan qarz; UPCOMING — qoldig'i bor, muddati hali kelmagan */
export type MonthlyDebtStatusFilter = 'DEBT' | 'UPCOMING' | 'ALL' | ChargeStatus;

export interface MonthlyDebtorsParams extends BillingFilterParams {
  period: string;
  status: MonthlyDebtStatusFilter;
  sortBy: 'remaining' | 'name' | 'dueDate';
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface MonthlyDebtor {
  student: BillingStudent;
  period: string;
  dueDate: string;
  due: boolean;
  charge: number;
  cancelledAmount: number;
  paid: number;
  remaining: number;
  status: ChargeStatus;
  remainingAtPeriodEnd: number | null;
  paidAfterPeriod: number | null;
  closedAt: string | null;
}

export interface MonthlyDebtorsSummary {
  period: string;
  label: string;
  periodEnded: boolean;
  students: number;
  debtors: number;
  upcoming: number;
  charge: number;
  cancelled: number;
  paid: number;
  dueRemaining: number;
  remaining: number;
  remainingAtPeriodEnd: number | null;
  paidAfterPeriod: number | null;
  byStatus: Record<ChargeStatus, number>;
}

export interface OutstandingParams extends BillingFilterParams {
  /** O'tgan oy — o'sha oy oxiridagi holat */
  period?: string;
  sortBy: 'debt' | 'oldest' | 'name';
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface OutstandingDebt {
  student: BillingStudent;
  debt: number;
  months: Array<{ period: string; remaining: number; dueDate: string }>;
  oldestDueDate: string;
  overdueDays: number;
  upcoming: number;
}

export interface OutstandingSummary {
  asOfDate: string;
  historical: boolean;
  students: number;
  debt: number;
  upcoming: number;
  /** Qaysi oy uchun qarz (yig'indisi = `debt`) */
  byMonth: Array<{ period: string; students: number; debt: number }>;
  byAge: Record<'upTo30' | 'upTo60' | 'over60', { students: number; debt: number }>;
}

export interface BillingPage<Item, Summary> {
  items: Item[];
  summary: Summary;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface StudentBillingHistory {
  student: BillingStudent;
  contractTotal: number;
  paidTotal: number;
  debt: number;
  upcoming: number;
  months: Array<{
    period: string;
    label: string;
    dueDate: string;
    charge: number;
    cancelledAmount: number;
    cancelReason: string | null;
    paid: number;
    remaining: number;
    status: ChargeStatus;
    due: boolean;
    closedAt: string | null;
    payments: Array<{ paymentId: string; code: string; paidAt: string; amount: number; explicit: boolean }>;
  }>;
  payments: Array<{
    id: string;
    code: string;
    amount: number;
    method: PaymentMethod;
    methodLabel: string;
    paidAt: string;
    isDeleted: boolean;
    refunded: number;
    allocations: Array<{ period: string; amount: number; explicit: boolean }>;
  }>;
  refunds: Array<{ id: string; paymentCode: string; amount: number; refundedAt: string; reason: string }>;
}

export interface BillingReportParams {
  from: string;
  to: string;
  groupId?: string;
  courseId?: string;
  teacherId?: string;
}

export interface BillingReportMonth {
  period: string;
  label: string;
  accrued: number;
  cancelled: number;
  collectedForPeriod: number;
  remainingNow: number;
  debtAtPeriodEnd: number;
  cashIn: number;
  refunds: number;
  cashNet: number;
  cashFor: { earlier: number; same: number; later: number; unallocated: number };
  students: number;
  debtors: number;
}

export interface BillingReport {
  months: BillingReportMonth[];
  totals: Pick<BillingReportMonth, 'accrued' | 'cancelled' | 'collectedForPeriod' | 'cashIn' | 'refunds' | 'cashNet' | 'cashFor'>;
}
