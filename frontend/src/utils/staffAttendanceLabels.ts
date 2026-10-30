import type { BadgeTone } from '@/components/ui/Badge';
import type { PermissionRequestType, RequestStatus, StaffAction, StaffDayStatus } from '@/types/staffAttendance';

export const STAFF_STATUS_LABELS: Record<StaffDayStatus, string> = {
  WORKING: 'Ishda',
  ON_BREAK: 'Tanaffusda',
  COMPLETED: 'Yakunlangan',
  LATE: 'Kechikkan',
  EARLY_DEPARTURE: 'Erta ketgan',
  PENDING_REVIEW: 'Tekshiruv kerak',
  ABSENT: 'Kelmagan',
  EXCUSED: 'Sababli',
  NOT_YET: 'Hali kelmagan',
  OFF: 'Dam olish',
};

export const STAFF_STATUS_TONES: Record<StaffDayStatus, BadgeTone> = {
  WORKING: 'success',
  ON_BREAK: 'info',
  COMPLETED: 'neutral',
  LATE: 'warning',
  EARLY_DEPARTURE: 'warning',
  PENDING_REVIEW: 'danger',
  ABSENT: 'danger',
  EXCUSED: 'accent',
  NOT_YET: 'neutral',
  OFF: 'neutral',
};

export const STAFF_ACTION_LABELS: Record<StaffAction, string> = {
  CHECK_IN: 'Ishga keldim',
  BREAK_START: 'Tanaffusga chiqdim',
  BREAK_END: 'Tanaffusdan qaytdim',
  CHECK_OUT: 'Ishdan ketdim',
};

/** Hodisa nomi (tarix va tuzatishlarda) */
export const STAFF_EVENT_LABELS: Record<StaffAction, string> = {
  CHECK_IN: 'Keldi',
  BREAK_START: 'Tanaffus boshlandi',
  BREAK_END: 'Tanaffus tugadi',
  CHECK_OUT: 'Ketdi',
};

export const REQUEST_TYPE_LABELS: Record<PermissionRequestType, string> = {
  ABSENCE: 'Kelmaslik',
  LATE_ARRIVAL: 'Kech kelish',
  EARLY_LEAVE: 'Erta ketish',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Ko‘rib chiqilmoqda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Rad etilgan',
  CANCELLED: 'Bekor qilingan',
};

export const REQUEST_STATUS_TONES: Record<RequestStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export const WEEK_DAY_SHORT: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'MONDAY', label: 'Du' },
  { key: 'TUESDAY', label: 'Se' },
  { key: 'WEDNESDAY', label: 'Ch' },
  { key: 'THURSDAY', label: 'Pa' },
  { key: 'FRIDAY', label: 'Ju' },
  { key: 'SATURDAY', label: 'Sh' },
  { key: 'SUNDAY', label: 'Ya' },
];

/** Markaz bitta joyda — vaqt doim Toshkent bo'yicha ko'rsatiladi (qurilma soati boshqa bo'lsa ham) */
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false });
const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' });

export function tashkentTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return TIME_FORMAT.format(typeof value === 'string' ? new Date(value) : value);
}

/** Bugungi sana Toshkent bo'yicha, "YYYY-MM-DD" */
export function tashkentDate(value: Date = new Date()): string {
  return DATE_FORMAT.format(value);
}

/** "2026-10-30" → "30.10.2026" */
export function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

/** 29 520 → "8 s 12 daq" (jadvallar uchun ixcham) */
export function shortDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} daq`;
  return rest === 0 ? `${hours} s` : `${hours} s ${rest} daq`;
}

/** "YYYY-MM-DD" ga kun qo'shish (UTC hisobida — vaqt mintaqasidan mustaqil) */
export function shiftDate(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** QR havolasi: telefon kamerasi ochadi va CRM'dagi "Davomatim" sahifasiga olib boradi */
export function qrLink(origin: string, token: string): string {
  return `${origin}/my-attendance?qr=${encodeURIComponent(token)}`;
}
