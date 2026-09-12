import type { AttendanceStatus, StudentStatus } from '../generated/prisma/client.js';

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'O‘qimoqda',
  FROZEN: 'Muzlatilgan',
  COMPLETED: 'Yakunlagan',
  DROPPED: 'Tashlab ketgan',
  GRADUATED: 'Bitirgan',
};

export const STUDENT_STATUS_ORDER: readonly StudentStatus[] = ['ACTIVE', 'FROZEN', 'COMPLETED', 'GRADUATED', 'DROPPED'];

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
