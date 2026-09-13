import type { BadgeTone } from '@/components/ui/Badge';
import type { CommissionEntryKind } from '@/types/commission';

export const COMMISSION_KIND_ORDER = ['ACCRUAL', 'REVERSAL', 'CARRY_OVER'] as const satisfies readonly CommissionEntryKind[];

export const COMMISSION_KIND_LABELS: Record<CommissionEntryKind, string> = {
  ACCRUAL: 'To‘lov',
  REVERSAL: 'Qaytarildi',
  CARRY_OVER: 'Ko‘chirildi',
};

export const COMMISSION_KIND_TONES: Record<CommissionEntryKind, BadgeTone> = {
  ACCRUAL: 'green',
  REVERSAL: 'red',
  CARRY_OVER: 'purple',
};
