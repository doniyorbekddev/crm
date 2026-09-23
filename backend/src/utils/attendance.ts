import type { AttendanceStatus } from '../generated/prisma/client.js';

/**
 * Davomat foizining **yagona ta'rifi** — butun tizimda shu ishlatiladi.
 *
 * Qatnashgan deb hisoblanadi: PRESENT, LATE va EXCUSED (sababli kelmaganlik o'quvchini
 * "yo'qolgan" qilmaydi). Ilgari panel/hisobot shu ta'rifni, ogohlantirish tizimi esa
 * EXCUSED'siz ta'rifni ishlatardi — bir guruh uchun ikki xil foiz chiqardi.
 */
export const ATTENDED_STATUSES: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'EXCUSED'];

export function isAttended(status: AttendanceStatus): boolean {
  return ATTENDED_STATUSES.includes(status);
}

/** Foiz: 0–100, butun son. Maxraj nol bo'lsa `null` (ma'lumot yo'q — nol foiz emas). */
export function attendanceRate(attended: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((attended / total) * 100);
}
