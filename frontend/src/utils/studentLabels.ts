import type { BadgeTone } from '@/components/ui/Badge';
import type { AttendanceStatus } from '@/types/attendance';
import type { DebtStatus, RiskLevel, StudentStatus } from '@/types/student';

export const STUDENT_STATUS_ORDER: readonly StudentStatus[] = [
  'ACTIVE',
  'FROZEN',
  'COMPLETED',
  'GRADUATED',
  'ALUMNI',
  'DROPPED',
];

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'O‘qimoqda',
  FROZEN: 'Muzlatilgan',
  COMPLETED: 'Yakunlagan',
  DROPPED: 'Tashlab ketgan',
  GRADUATED: 'Bitirgan',
  ALUMNI: 'Bitiruvchi (aloqada)',
};

export const STUDENT_STATUS_TONES: Record<StudentStatus, BadgeTone> = {
  ACTIVE: 'green',
  FROZEN: 'yellow',
  COMPLETED: 'blue',
  DROPPED: 'red',
  GRADUATED: 'purple',
  ALUMNI: 'blue',
};

export const RISK_LEVEL_ORDER: readonly RiskLevel[] = ['CRITICAL', 'AT_RISK', 'ATTENTION', 'HEALTHY'];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  HEALTHY: 'Barqaror',
  ATTENTION: 'E‘tibor kerak',
  AT_RISK: 'Xavf ostida',
  CRITICAL: 'Kritik',
};

export const RISK_LEVEL_TONES: Record<RiskLevel, BadgeTone> = {
  HEALTHY: 'green',
  ATTENTION: 'blue',
  AT_RISK: 'yellow',
  CRITICAL: 'red',
};

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  UNPAID: 'To‘lanmagan',
  PARTIAL: 'Qisman to‘langan',
  PAID: 'To‘langan',
};

export const DEBT_STATUS_TONES: Record<DebtStatus, BadgeTone> = {
  UNPAID: 'red',
  PARTIAL: 'yellow',
  PAID: 'green',
};

export const ATTENDANCE_STATUS_ORDER: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Keldi',
  ABSENT: 'Kelmadi',
  LATE: 'Kechikdi',
  EXCUSED: 'Sababli',
};

export const ATTENDANCE_STATUS_TONES: Record<AttendanceStatus, BadgeTone> = {
  PRESENT: 'green',
  ABSENT: 'red',
  LATE: 'yellow',
  EXCUSED: 'blue',
};

/** Davomat tugmalari uchun ranglar — belgilangani to‘liq bo‘yaladi */
export const ATTENDANCE_BUTTON_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-600 text-white border-emerald-600',
  ABSENT: 'bg-red-600 text-white border-red-600',
  LATE: 'bg-amber-500 text-white border-amber-500',
  EXCUSED: 'bg-brand-600 text-white border-brand-600',
};

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
