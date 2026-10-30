import type { StaffDayDto } from './common.js';

/**
 * Davr bo'yicha jami (hisobot va xodim sahifasi uchun bitta qoida):
 *  - **kutilgan kun** — jadval bo'yicha ish kuni (bugun hali baholanmagani — `NOT_YET` — kirmaydi);
 *  - **haqiqiy ish vaqti** — faqat yakunlangan (chiqish belgilangan) kunlar, tanaffussiz. Chiqish belgilanmagan
 *    kun vaqti o'ylab topilmaydi: `reviewDays` da alohida sanaladi;
 *  - **davomat %** = kutilgan kunlardan kelganlari / (kutilgan − sababli) × 100.
 */
export interface StaffSummary {
  expectedDays: number;
  attendedDays: number;
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  excusedDays: number;
  earlyDepartureDays: number;
  reviewDays: number;
  scheduledSeconds: number;
  workedSeconds: number;
  breakSeconds: number;
  lateMinutes: number;
  earlyMinutes: number;
  attendancePercent: number | null;
}

const CLOSED = new Set(['COMPLETED', 'LATE', 'EARLY_DEPARTURE']);

export function summarize(days: readonly StaffDayDto[]): StaffSummary {
  const summary: StaffSummary = {
    expectedDays: 0,
    attendedDays: 0,
    onTimeDays: 0,
    lateDays: 0,
    absentDays: 0,
    excusedDays: 0,
    earlyDepartureDays: 0,
    reviewDays: 0,
    scheduledSeconds: 0,
    workedSeconds: 0,
    breakSeconds: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    attendancePercent: null,
  };
  let excusedExpected = 0;
  for (const day of days) {
    const counted = day.expected && day.status !== 'NOT_YET';
    if (counted) {
      summary.expectedDays += 1;
      if (day.status === 'EXCUSED') excusedExpected += 1;
      else summary.scheduledSeconds += day.scheduledSeconds;
      if (day.checkInAt) summary.attendedDays += 1;
    }
    if (day.status === 'EXCUSED') summary.excusedDays += 1;
    if (day.status === 'ABSENT') summary.absentDays += 1;
    if (day.status === 'PENDING_REVIEW') summary.reviewDays += 1;
    if (day.arrival === 'LATE') summary.lateDays += 1;
    if (day.arrival === 'PRESENT' && day.expected) summary.onTimeDays += 1;
    if (day.earlyMinutes > 0) summary.earlyDepartureDays += 1;
    if (CLOSED.has(day.status)) {
      summary.workedSeconds += day.workedSeconds ?? 0;
      summary.breakSeconds += day.breakSeconds;
    }
    summary.lateMinutes += day.lateMinutes;
    summary.earlyMinutes += day.earlyMinutes;
  }
  const base = summary.expectedDays - excusedExpected;
  summary.attendancePercent = base > 0 ? Math.round((summary.attendedDays / base) * 1000) / 10 : null;
  return summary;
}
