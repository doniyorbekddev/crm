import type { BadgeTone } from '@/components/ui/Badge';
import type { DebtDueFilter, InstallmentStatus } from '@/types/paymentSchedule';

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  PAID: 'To‘langan',
  PARTIAL: 'Qisman to‘langan',
  DUE_TODAY: 'Bugun to‘lanadi',
  UPCOMING: 'Kutilmoqda',
  OVERDUE: 'Muddati o‘tgan',
};

export const INSTALLMENT_STATUS_TONES: Record<InstallmentStatus, BadgeTone> = {
  PAID: 'green',
  PARTIAL: 'blue',
  DUE_TODAY: 'yellow',
  UPCOMING: 'gray',
  OVERDUE: 'red',
};

export const DEBT_DUE_ORDER: readonly DebtDueFilter[] = ['all', 'overdue', 'upcoming'];

export const DEBT_DUE_LABELS: Record<DebtDueFilter, string> = {
  all: 'Barcha muddatlar',
  overdue: 'Muddati o‘tgan',
  upcoming: '7 kun ichida',
};
