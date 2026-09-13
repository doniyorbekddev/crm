import type { SalaryPeriodStatus } from '@/types/teacher';

export type CommissionEntryKind = 'ACCRUAL' | 'REVERSAL' | 'CARRY_OVER';

export interface CommissionEntry {
  id: string;
  kind: CommissionEntryKind;
  year: number;
  month: number;
  label: string;
  occurredAt: string;
  baseAmount: number;
  percentage: number;
  amount: number;
  reason: string | null;
  locked: boolean;
  payment: {
    id: string;
    code: string;
    paidAt: string;
    amount: number;
    isCancelled: boolean;
    student: { id: string; code: string; firstName: string; lastName: string };
    group: { id: string; name: string } | null;
  } | null;
}

export interface CommissionMonth {
  year: number;
  month: number;
  label: string;
  students: number;
  payments: number;
  revenue: number;
  percentage: number;
  commission: number;
  salary: {
    id: string;
    status: SalaryPeriodStatus;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    lockedAt: string | null;
  } | null;
}

export interface CommissionTeacherRef {
  profileId: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialization: string | null;
  isActive: boolean;
}

export interface TeacherCommissionSummary extends CommissionMonth {
  teacher: CommissionTeacherRef;
}

export interface TeacherCommissionDetail {
  teacher: CommissionTeacherRef;
  month: CommissionMonth;
  entries: CommissionEntry[];
  history: CommissionMonth[];
}

export interface CommissionParams {
  year: number;
  month: number;
}
