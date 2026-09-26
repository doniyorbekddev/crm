import { z } from 'zod';
import { optionalField } from './common.validator.js';

export const RECURRING_FREQUENCIES = ['DAILY', 'WEEKLY', 'WEEKDAYS'] as const;
export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

const time = z.string('Vaqtni kiriting').trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt formati: 08:00');
const date = z.string('Sanani kiriting').trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

const fields = {
  title: z.string('Sarlavhani kiriting').trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
  description: optionalField(z.string().trim().max(2000, 'Tavsif juda uzun')),
  maxPoints: z.coerce.number().int().min(1, 'Ball kamida 1').max(1000, 'Ball 1000 dan oshmasin'),
  xpReward: z.coerce.number().int().min(0).max(1000),
  frequency: z.enum(RECURRING_FREQUENCIES, 'Takrorlanishni tanlang'),
  weekdays: z.array(z.enum(WEEK_DAYS, 'Hafta kuni noto‘g‘ri')).max(7),
  startDate: date,
  endDate: date.nullable(),
  publishTime: time,
  deadlineTime: time,
  deadlineOffsetDays: z.coerce.number().int().min(0, '0 dan kam emas').max(14, 'Ko‘pi bilan 14 kun'),
};

export interface ScheduleShape {
  frequency: (typeof RECURRING_FREQUENCIES)[number];
  weekdays: Array<(typeof WEEK_DAYS)[number]>;
  startDate: string;
  endDate: string | null;
  publishTime: string;
  deadlineTime: string;
  deadlineOffsetDays: number;
}

/** Jadvalning o'zaro bog'liq qoidalari — yaratishda va tahrirda (birlashtirilgan qiymatlar bilan) */
export function scheduleIssues(value: ScheduleShape): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  const unique = new Set(value.weekdays);
  if (unique.size !== value.weekdays.length) issues.push({ path: 'weekdays', message: 'Kun takrorlangan' });
  if (value.frequency === 'WEEKLY' && value.weekdays.length !== 1) issues.push({ path: 'weekdays', message: 'Haftalik uchun bitta kunni tanlang' });
  if (value.frequency === 'WEEKDAYS' && value.weekdays.length === 0) issues.push({ path: 'weekdays', message: 'Kamida bitta kunni tanlang' });
  if (value.endDate && value.endDate < value.startDate) issues.push({ path: 'endDate', message: 'Tugash sanasi boshlanishdan oldin bo‘lmasin' });
  if (value.endDate && Date.parse(value.endDate) - Date.parse(value.startDate) > 400 * 86_400_000) issues.push({ path: 'endDate', message: 'Ko‘pi bilan 400 kun' });
  // Muddat e'londan keyin bo'lishi shart — aks holda vazifa "muddati o'tgan" holda tug'iladi
  if (value.deadlineOffsetDays === 0 && value.deadlineTime <= value.publishTime) issues.push({ path: 'deadlineTime', message: 'Muddat e’lon vaqtidan keyin bo‘lsin' });
  return issues;
}

export const createRecurringHomeworkSchema = z
  .object({
    groupId: z.string('Guruhni tanlang').trim().min(1, 'Guruhni tanlang').max(50),
    ...fields,
    description: fields.description,
    maxPoints: fields.maxPoints.default(100),
    xpReward: fields.xpReward.default(20),
    weekdays: fields.weekdays.default([]),
    endDate: fields.endDate.optional().transform((value) => value ?? null),
    publishTime: fields.publishTime.default('08:00'),
    deadlineTime: fields.deadlineTime.default('23:59'),
    deadlineOffsetDays: fields.deadlineOffsetDays.default(0),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const issue of scheduleIssues(value)) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
  });

export const updateRecurringHomeworkSchema = z
  .object({ ...fields, isActive: z.boolean() })
  .partial()
  .strict();

export const recurringListQuerySchema = z.object({
  groupId: optionalField(z.string().trim().min(1).max(50)),
});

export type CreateRecurringHomeworkInput = z.infer<typeof createRecurringHomeworkSchema>;
export type UpdateRecurringHomeworkInput = z.infer<typeof updateRecurringHomeworkSchema>;
