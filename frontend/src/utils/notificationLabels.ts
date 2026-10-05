import {
  AlertTriangle,
  Award,
  BadgeCheck,
  BookOpen,
  ClipboardCheck,
  Sparkles,
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
  FileBarChart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BadgeTone } from '@/components/ui/Badge';
import type { NotificationCategory, NotificationPriority, NotificationType } from '@/types/notification';

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
  'HOMEWORK_CREATED',
  'HOMEWORK_GRADED',
  'EXAM_RESULT',
  'LEVEL_UP',
  'CERTIFICATE_ISSUED',
  'WEEKLY_REPORT',
  'HOMEWORK_DEADLINE',
  'HOMEWORK_RETURNED',
  'EXAM_SCHEDULED',
  'LOW_SCORE',
  'ATTENDANCE_LATE',
  'RISK_INCREASED',
  'SYSTEM',
];

export const NOTIFICATION_CATEGORY_ORDER: readonly NotificationCategory[] = ['SALES', 'FINANCE', 'ATTENDANCE', 'HOMEWORK', 'EXAM', 'ACADEMIC', 'SYSTEM'];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  SALES: 'Sotuv',
  FINANCE: 'Moliya',
  ATTENDANCE: 'Davomat',
  HOMEWORK: 'Uy vazifasi',
  EXAM: 'Imtihon',
  ACADEMIC: 'O‘quv jarayoni',
  SYSTEM: 'Tizim',
};

/** Tur → toifa. Backend (`notification.validator.ts`) bilan bir xil bo‘lishi shart */
export const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  NEW_LEAD: 'SALES',
  LEAD_ASSIGNED: 'SALES',
  FOLLOW_UP_REMINDER: 'SALES',
  FOLLOW_UP_OVERDUE: 'SALES',
  TRIAL_LESSON_REMINDER: 'SALES',
  NEW_STUDENT: 'SALES',
  NEW_PAYMENT: 'FINANCE',
  DEBT_REMINDER: 'FINANCE',
  EXPENSE_APPROVAL: 'FINANCE',
  PAYMENT_DUE_SOON: 'FINANCE',
  CHILD_ABSENT: 'ATTENDANCE',
  ATTENDANCE_LATE: 'ATTENDANCE',
  HOMEWORK_CREATED: 'HOMEWORK',
  HOMEWORK_GRADED: 'HOMEWORK',
  HOMEWORK_DEADLINE: 'HOMEWORK',
  HOMEWORK_RETURNED: 'HOMEWORK',
  EXAM_RESULT: 'EXAM',
  EXAM_SCHEDULED: 'EXAM',
  LOW_SCORE: 'EXAM',
  LEVEL_UP: 'ACADEMIC',
  CERTIFICATE_ISSUED: 'ACADEMIC',
  WEEKLY_REPORT: 'ACADEMIC',
  RISK_INCREASED: 'ACADEMIC',
  NEGATIVE_FEEDBACK: 'ACADEMIC',
  SYSTEM: 'SYSTEM',
  DAILY_DIGEST: 'SYSTEM',
};

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
  HOMEWORK_CREATED: 'Yangi uy vazifasi',
  HOMEWORK_GRADED: 'Vazifa baholandi',
  EXAM_RESULT: 'Imtihon natijasi',
  LEVEL_UP: 'Yangi daraja',
  CERTIFICATE_ISSUED: 'Sertifikat berildi',
  WEEKLY_REPORT: 'Haftalik hisobot',
  HOMEWORK_DEADLINE: 'Vazifa muddati yaqin',
  HOMEWORK_RETURNED: 'Vazifa qaytarildi',
  EXAM_SCHEDULED: 'Imtihon rejalashtirildi',
  LOW_SCORE: 'Past natija',
  ATTENDANCE_LATE: 'Darsga kechikdi',
  RISK_INCREASED: 'O‘quvchi xavfi oshdi',
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
  HOMEWORK_CREATED: BookOpen,
  HOMEWORK_GRADED: ClipboardCheck,
  EXAM_RESULT: Target,
  LEVEL_UP: Sparkles,
  CERTIFICATE_ISSUED: Award,
  WEEKLY_REPORT: FileBarChart,
  HOMEWORK_DEADLINE: CalendarClock,
  HOMEWORK_RETURNED: ClipboardCheck,
  EXAM_SCHEDULED: CalendarClock,
  LOW_SCORE: AlertTriangle,
  ATTENDANCE_LATE: CalendarX,
  RISK_INCREASED: AlertTriangle,
  SYSTEM: Info,
};

/** Bildirishnoma turiga qarab ikonka foni */
export const NOTIFICATION_TYPE_CLASSES: Record<NotificationType, string> = {
  NEW_LEAD: 'bg-primary-subtle text-primary',
  LEAD_ASSIGNED: 'bg-primary-subtle text-primary',
  NEW_PAYMENT: 'bg-success-subtle text-success',
  FOLLOW_UP_REMINDER: 'bg-warning-subtle text-warning',
  FOLLOW_UP_OVERDUE: 'bg-danger-subtle text-danger',
  NEW_STUDENT: 'bg-accent-subtle text-accent',
  CHILD_ABSENT: 'bg-warning-subtle text-warning',
  PAYMENT_DUE_SOON: 'bg-warning-subtle text-warning',
  NEGATIVE_FEEDBACK: 'bg-danger-subtle text-danger',
  HOMEWORK_CREATED: 'bg-info-subtle text-info',
  HOMEWORK_GRADED: 'bg-success-subtle text-success',
  EXAM_RESULT: 'bg-accent-subtle text-accent',
  LEVEL_UP: 'bg-warning-subtle text-warning',
  CERTIFICATE_ISSUED: 'bg-success-subtle text-success',
  WEEKLY_REPORT: 'bg-primary-subtle text-primary',
  HOMEWORK_DEADLINE: 'bg-warning-subtle text-warning',
  HOMEWORK_RETURNED: 'bg-warning-subtle text-warning',
  EXAM_SCHEDULED: 'bg-accent-subtle text-accent',
  LOW_SCORE: 'bg-warning-subtle text-warning',
  ATTENDANCE_LATE: 'bg-warning-subtle text-warning',
  RISK_INCREASED: 'bg-danger-subtle text-danger',
  DEBT_REMINDER: 'bg-danger-subtle text-danger',
  TRIAL_LESSON_REMINDER: 'bg-warning-subtle text-warning',
  EXPENSE_APPROVAL: 'bg-warning-subtle text-warning',
  DAILY_DIGEST: 'bg-primary-subtle text-primary',
  SYSTEM: 'bg-surface-muted text-fg-muted',
};

/**
 * Bildirishnomadan tegishli sahifaga havola. Kabinet (o'quvchi/ota-ona) uchun — kabinet sahifalari:
 * xodim sahifasiga yo'naltirish ruxsatsiz sahifa ochardi.
 */
export function notificationLink(entityType: string | null, entityId: string | null, scope: 'staff' | 'portal' = 'staff'): string | null {
  if (!entityType) return null;
  if (scope === 'portal') {
    switch (entityType) {
      case 'homework':
        return entityId ? `/portal/homework/${entityId}` : '/portal/homework';
      case 'exam':
        return entityId ? `/portal/exams/${entityId}` : '/portal/exams';
      case 'attendance':
        return '/portal/attendance';
      case 'weekly_report':
        return '/portal/weekly-report';
      case 'student':
      case 'certificate':
        return '/portal';
      default:
        return null;
    }
  }
  switch (entityType) {
    case 'lead':
      return entityId ? `/leads/${entityId}` : '/leads';
    case 'followUp':
      return '/follow-ups';
    case 'student':
      return entityId ? `/students/${entityId}` : '/students';
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
    case 'homework':
      return '/homework';
    case 'exam':
      return '/exams';
    case 'attendance':
      return '/attendance';
    case 'weekly_report':
      return '/portal/weekly-report';
    default:
      return null;
  }
}

export const NOTIFICATION_PRIORITY_LABELS: Record<NotificationPriority, string> = {
  HIGH: 'Muhim',
  NORMAL: 'Oddiy',
  LOW: 'Ma’lumot uchun',
};

export const NOTIFICATION_PRIORITY_TONES: Record<NotificationPriority, BadgeTone> = {
  HIGH: 'red',
  NORMAL: 'gray',
  LOW: 'blue',
};
