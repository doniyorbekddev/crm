import type { BadgeTone } from '@/components/ui/Badge';
import type { CallDirection, CallResult, CallStatus } from '@/types/call';
import type { FollowUpScope, FollowUpState } from '@/types/followUp';

export const CALL_RESULT_ORDER: readonly CallResult[] = [
  'ANSWERED',
  'INTERESTED',
  'CALLBACK',
  'NOT_INTERESTED',
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
];

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  ANSWERED: 'Javob berdi',
  NO_ANSWER: 'Javob bermadi',
  BUSY: 'Band',
  WRONG_NUMBER: 'Raqam noto‘g‘ri',
  INTERESTED: 'Qiziqdi',
  NOT_INTERESTED: 'Qiziqmadi',
  CALLBACK: 'Qayta qo‘ng‘iroq so‘radi',
};

export const CALL_RESULT_TONES: Record<CallResult, BadgeTone> = {
  ANSWERED: 'blue',
  NO_ANSWER: 'gray',
  BUSY: 'gray',
  WRONG_NUMBER: 'red',
  INTERESTED: 'green',
  NOT_INTERESTED: 'red',
  CALLBACK: 'yellow',
};

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  COMPLETED: 'Bajarilgan',
  CANCELLED: 'Bekor qilingan',
};

export const CALL_DIRECTION_LABELS: Record<CallDirection, string> = {
  OUTGOING: 'Chiquvchi',
  INCOMING: 'Kiruvchi',
};

export const FOLLOW_UP_STATE_LABELS: Record<FollowUpState, string> = {
  PENDING: 'Bajarilmagan',
  OVERDUE: 'Kechikkan',
  DONE: 'Bajarilgan',
  CANCELLED: 'Bekor qilingan',
};

export const FOLLOW_UP_STATE_TONES: Record<FollowUpState, BadgeTone> = {
  PENDING: 'blue',
  OVERDUE: 'red',
  DONE: 'green',
  CANCELLED: 'gray',
};

export const FOLLOW_UP_SCOPE_LABELS: Record<FollowUpScope, string> = {
  all: 'Barchasi',
  overdue: 'Kechikkan',
  today: 'Bugun',
  tomorrow: 'Ertaga',
  upcoming: 'Keyingi kunlar',
  done: 'Bajarilgan',
};

/** 180 → "3 daqiqa", 45 → "45 soniya" */
export function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 60) return `${seconds} soniya`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes} daq ${rest} son` : `${minutes} daqiqa`;
}
