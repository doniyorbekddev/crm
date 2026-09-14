import type { PersonRef } from './lead';
import type { DebtStatus } from './student';

export type PaymentMethod = 'CASH' | 'CARD' | 'CLICK' | 'PAYME' | 'UZUM' | 'BANK' | 'OTHER';
export type DebtRange = 'all' | 'zero' | 'upto500k' | '500k-1m' | '1m-plus';

export interface PaymentItem {
  id: string;
  number: number;
  /** "PM-000045" — kvitansiya raqami */
  code: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  comment: string | null;
  isDeleted: boolean;
  deleteReason: string | null;
  deletedBy: PersonRef | null;
  student: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    phone: string;
    group: { id: string; name: string } | null;
  };
  course: { id: string; name: string };
  manager: PersonRef | null;
  accountant: PersonRef | null;
  /** Qaytarilgan jami summa */
  refundedAmount: number;
  refunds: PaymentRefund[];
}

export interface PaymentRefund {
  id: string;
  /** "QT-000012" */
  code: string;
  amount: number;
  method: PaymentMethod;
  refundedAt: string;
  reason: string;
  createdBy: PersonRef | null;
}

export interface RefundPayload {
  amount: number;
  method: PaymentMethod;
  accountId?: string;
  reason: string;
}

export interface PaymentListParams {
  page: number;
  limit: number;
  search?: string;
  studentId?: string;
  courseId?: string;
  groupId?: string;
  managerId?: string;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  includeDeleted?: 'true' | 'false';
  sortBy?: 'paidAt' | 'amount' | 'number';
  sortOrder?: 'asc' | 'desc';
}

export type PaymentStatsParams = Omit<PaymentListParams, 'page' | 'limit' | 'includeDeleted' | 'sortBy' | 'sortOrder'>;

export interface PaymentStats {
  total: number;
  count: number;
  byMethod: Array<{ method: PaymentMethod; total: number; count: number }>;
}

export interface PaymentPayload {
  studentId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  comment?: string;
  /** Forma ochilishi uchun bitta kalit — takroriy yuborish yangi to‘lov yaratmaydi */
  idempotencyKey?: string;
  /** Yaqinda xuddi shu summa qabul qilingan bo‘lsa ham saqlash */
  confirmDuplicate?: boolean;
}

export interface DebtItem {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  parentPhone: string | null;
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
  total: number;
  paid: number;
  remaining: number;
  status: DebtStatus;
  lastPayment: { paidAt: string; amount: number } | null;
  startDate: string;
}

export interface DebtListParams {
  page: number;
  limit: number;
  search?: string;
  range?: DebtRange;
  courseId?: string;
  groupId?: string;
  sortBy?: 'remaining' | 'name' | 'startDate';
  sortOrder?: 'asc' | 'desc';
}

export type DebtSummaryParams = Omit<DebtListParams, 'page' | 'limit' | 'range'>;

export interface DebtSummary {
  totalRemaining: number;
  totalPaid: number;
  totalContracts: number;
  students: number;
  byRange: Record<Exclude<DebtRange, 'all'>, { students: number; remaining: number }>;
}

export interface PaymentFormLookups {
  courses: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; courseId: string }>;
  managers: Array<{ id: string; firstName: string; lastName: string; roleName: string }>;
}
