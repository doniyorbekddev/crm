import type { CallDirection, CallResult, CallStatus, FollowUpStatus } from '../generated/prisma/client.js';

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  ANSWERED: 'Javob berdi',
  NO_ANSWER: 'Javob bermadi',
  BUSY: 'Band',
  WRONG_NUMBER: 'Raqam noto‘g‘ri',
  INTERESTED: 'Qiziqdi',
  NOT_INTERESTED: 'Qiziqmadi',
  CALLBACK: 'Qayta qo‘ng‘iroq so‘radi',
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

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  PENDING: 'Bajarilmagan',
  DONE: 'Bajarilgan',
  CANCELLED: 'Bekor qilingan',
};
