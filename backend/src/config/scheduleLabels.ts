import type { WeekDay } from '../generated/prisma/client.js';

/** Dars jadvali xabarlarida ishlatiladi (frontenddagi `courseLabels.ts` bilan bir xil) */
export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

export const WEEK_DAY_ORDER: readonly WeekDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];
