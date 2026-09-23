import type { AttendanceStatus, RiskLevel, StudentStatus } from '../generated/prisma/client.js';

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'O‘qimoqda',
  FROZEN: 'Muzlatilgan',
  COMPLETED: 'Yakunlagan',
  DROPPED: 'Tashlab ketgan',
  GRADUATED: 'Bitirgan',
  ALUMNI: 'Bitiruvchi (aloqada)',
};

export const STUDENT_STATUS_ORDER: readonly StudentStatus[] = [
  'ACTIVE',
  'FROZEN',
  'COMPLETED',
  'GRADUATED',
  'ALUMNI',
  'DROPPED',
];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  HEALTHY: 'Barqaror',
  ATTENTION: 'E‘tibor kerak',
  AT_RISK: 'Xavf ostida',
  CRITICAL: 'Kritik',
};

export const RISK_LEVEL_ORDER: readonly RiskLevel[] = ['CRITICAL', 'AT_RISK', 'ATTENTION', 'HEALTHY'];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Keldi',
  ABSENT: 'Kelmadi',
  LATE: 'Kechikdi',
  EXCUSED: 'Sababli',
};

/** 45 → "ST-000045" */
export function formatStudentNumber(value: number): string {
  return `ST-${String(value).padStart(6, '0')}`;
}
