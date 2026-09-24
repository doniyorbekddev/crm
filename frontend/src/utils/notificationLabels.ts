import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  CalendarClock,
  CalendarX,
  GraduationCap,
  HandCoins,
  Info,
  MessageSquareWarning,
  Newspaper,
  Target,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NotificationType } from '@/types/notification';

export const NOTIFICATION_TYPE_ORDER: readonly NotificationType[] = [
  'NEW_LEAD',
  'LEAD_ASSIGNED',
  'FOLLOW_UP_REMINDER',
  'FOLLOW_UP_OVERDUE',
  'NEW_PAYMENT',
  'NEW_STUDENT',
  'DEBT_REMINDER',
  'TRIAL_LESSON_REMINDER',
  'EXPENSE_APPROVAL',
  'DAILY_DIGEST',
  'CHILD_ABSENT',
  'PAYMENT_DUE_SOON',
  'NEGATIVE_FEEDBACK',
  'SYSTEM',
];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  NEW_LEAD: 'Yangi lead',
  LEAD_ASSIGNED: 'Lead biriktirildi',
  NEW_PAYMENT: 'Yangi to‘lov',
  FOLLOW_UP_REMINDER: 'Follow-up eslatmasi',
  FOLLOW_UP_OVERDUE: 'Kechikkan follow-up',
  NEW_STUDENT: 'Yangi o‘quvchi',
  DEBT_REMINDER: 'Qarzdorlik',
  TRIAL_LESSON_REMINDER: 'Sinov darsi',
  EXPENSE_APPROVAL: 'Xarajat tasdig‘i',
  DAILY_DIGEST: 'Kunlik xulosa',
  CHILD_ABSENT: 'Farzand darsga kelmadi',
  PAYMENT_DUE_SOON: 'To‘lov muddati yaqin',
  NEGATIVE_FEEDBACK: 'Past baho bilan fikr',
  SYSTEM: 'Tizim',
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  NEW_LEAD: Target,
  LEAD_ASSIGNED: UserCheck,
  NEW_PAYMENT: Wallet,
  FOLLOW_UP_REMINDER: CalendarClock,
  FOLLOW_UP_OVERDUE: AlertTriangle,
  NEW_STUDENT: GraduationCap,
  DEBT_REMINDER: HandCoins,
  TRIAL_LESSON_REMINDER: BellRing,
  EXPENSE_APPROVAL: BadgeCheck,
  DAILY_DIGEST: Newspaper,
  CHILD_ABSENT: CalendarX,
  PAYMENT_DUE_SOON: CalendarClock,
  NEGATIVE_FEEDBACK: MessageSquareWarning,
  SYSTEM: Info,
};

/** Bildirishnoma turiga qarab ikonka foni */
export const NOTIFICATION_TYPE_CLASSES: Record<NotificationType, string> = {
  NEW_LEAD: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300',
  LEAD_ASSIGNED: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300',
  NEW_PAYMENT: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
  FOLLOW_UP_REMINDER: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  FOLLOW_UP_OVERDUE: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  NEW_STUDENT: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300',
  CHILD_ABSENT: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  PAYMENT_DUE_SOON: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  NEGATIVE_FEEDBACK: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  DEBT_REMINDER: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  TRIAL_LESSON_REMINDER: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  EXPENSE_APPROVAL: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  DAILY_DIGEST: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300',
  SYSTEM: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** Bildirishnomadan tegishli sahifaga havola */
export function notificationLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case 'lead':
      return entityId ? `/leads/${entityId}` : '/leads';
    case 'followUp':
      return '/follow-ups';
    case 'student':
      return '/students';
    case 'payment':
      return '/payments';
    case 'debt':
      return '/debts';
    case 'expense':
      return '/expenses';
    case 'alert':
      return '/alerts';
    case 'digest':
      return '/executive';
    default:
      return null;
  }
}
