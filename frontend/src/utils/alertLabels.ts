import type { BadgeTone } from '@/components/ui/Badge';
import type { AlertSeverity, AlertType, TargetType } from '@/types/alert';

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  HIGH_DEBT: 'Katta qarz',
  LOW_ATTENDANCE: 'Past davomat',
  HIGH_DROPOUT: 'Chiqib ketish xavfi',
  OVERDUE_FOLLOWUPS: 'Kechikkan follow-up',
  UNPAID_SALARY: 'To‘lanmagan maosh',
  BUDGET_EXCEEDED: 'Budjetdan oshish',
  LOW_GROUP_CAPACITY: 'To‘lmagan guruh',
  SALES_TARGET_ACHIEVED: 'Reja bajarildi',
};

export const ALERT_TYPE_ORDER: readonly AlertType[] = [
  'HIGH_DROPOUT',
  'HIGH_DEBT',
  'LOW_ATTENDANCE',
  'UNPAID_SALARY',
  'BUDGET_EXCEEDED',
  'OVERDUE_FOLLOWUPS',
  'LOW_GROUP_CAPACITY',
  'SALES_TARGET_ACHIEVED',
];

export const ALERT_SEVERITY_ORDER: readonly AlertSeverity[] = ['CRITICAL', 'WARNING', 'INFO', 'SUCCESS'];

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: 'Kritik',
  WARNING: 'Ogohlantirish',
  INFO: 'Ma’lumot',
  SUCCESS: 'Yutuq',
};

export const ALERT_SEVERITY_TONES: Record<AlertSeverity, BadgeTone> = {
  CRITICAL: 'red',
  WARNING: 'yellow',
  INFO: 'blue',
  SUCCESS: 'green',
};

export const TARGET_TYPE_ORDER: readonly TargetType[] = ['LEADS', 'SALES', 'REVENUE'];

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  LEADS: 'Leadlar',
  SALES: 'Sotuvlar',
  REVENUE: 'Tushum',
};
