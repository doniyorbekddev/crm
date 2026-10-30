import { z } from 'zod';
import { exportFormatSchema, optionalField } from './common.validator.js';
import { WEEK_DAYS } from './group.validator.js';

const dateSchema = z.string('Sanani kiriting').regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: YYYY-MM-DD');
const timeSchema = z
  .string('Vaqtni kiriting')
  .trim()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Vaqt formati: 09:00');
const reasonSchema = z
  .string('Sababni yozing')
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(3, 'Sababni yozing (kamida 3 belgi)').max(255, 'Sabab 255 belgidan oshmasin'));
const idSchema = z.string().trim().min(1).max(50);

export const ACTIONS = ['CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT'] as const;

/** QR ichidagi token: 32 bayt base64url (43 belgi) */
export const qrTokenSchema = z.object({
  token: z
    .string('QR kod topilmadi')
    .trim()
    .regex(/^[A-Za-z0-9_-]{20,100}$/, 'QR kod tanilmadi'),
});

export const scanSchema = qrTokenSchema.extend({
  action: z.enum(ACTIONS, 'Amal noto‘g‘ri'),
});

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const dateQuerySchema = z.object({ date: dateSchema.optional() });

export const userDateParamsSchema = z.object({ userId: idSchema, date: dateSchema });
export const userParamsSchema = z.object({ userId: idSchema });

export const rangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((value) => value.from <= value.to, { message: 'Davr noto‘g‘ri', path: ['to'] })
  .refine((value) => Date.parse(value.to) - Date.parse(value.from) <= 92 * 86_400_000, { message: 'Davr 3 oydan oshmasin', path: ['to'] });

export const exportQuerySchema = z.object({ from: dateSchema, to: dateSchema, format: exportFormatSchema }).refine((value) => value.from <= value.to, {
  message: 'Davr noto‘g‘ri',
  path: ['to'],
});

export const permissionRequestSchema = z.object({
  type: z.enum(['ABSENCE', 'LATE_ARRIVAL', 'EARLY_LEAVE'], 'So‘rov turini tanlang'),
  startDate: dateSchema,
  endDate: optionalField(dateSchema),
  time: optionalField(timeSchema),
  reason: reasonSchema,
});

export const requestListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  userId: idSchema.optional(),
});

export const decideRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], 'Qaror noto‘g‘ri'),
  note: optionalField(z.string().trim().max(255, 'Izoh 255 belgidan oshmasin')),
});

const minutes = (max: number) => z.coerce.number('Son kiriting').int('Butun son kiriting').min(0, 'Manfiy bo‘lmasin').max(max, `${max} dan oshmasin`);

export const scheduleSchema = z.object({
  mode: z.enum(['FIXED', 'LESSONS'], 'Jadval turini tanlang'),
  workDays: z.array(z.enum(WEEK_DAYS)).max(7).default([]),
  startTime: optionalField(timeSchema),
  endTime: optionalField(timeSchema),
  breakMinutes: minutes(240).default(0),
  graceMinutes: minutes(120).default(10),
  absentAfterMinutes: minutes(720).default(120),
  lessonLeadMinutes: minutes(120).default(15),
  effectiveFrom: optionalField(dateSchema),
  note: optionalField(z.string().trim().max(255)),
});

export const holidaySchema = z.object({
  date: dateSchema,
  name: z.string('Nomini kiriting').trim().min(2, 'Nomini kiriting').max(100, 'Nom 100 belgidan oshmasin'),
});

export const yearQuerySchema = z.object({ year: z.coerce.number().int().min(2020).max(2100) });

export const exceptionSchema = z.object({
  date: dateSchema,
  type: z.enum(['DAY_OFF', 'CUSTOM_HOURS'], 'Turini tanlang'),
  startTime: optionalField(timeSchema),
  endTime: optionalField(timeSchema),
  reason: reasonSchema,
});

export const correctionSchema = z.discriminatedUnion(
  'action',
  [
    z.object({ action: z.literal('ADD'), type: z.enum(ACTIONS, 'Hodisa turini tanlang'), time: timeSchema, reason: reasonSchema }),
    z.object({ action: z.literal('VOID'), eventId: idSchema, reason: reasonSchema }),
    z.object({ action: z.literal('REPLACE'), eventId: idSchema, time: timeSchema, reason: reasonSchema }),
  ],
  'Tuzatish turi noto‘g‘ri',
);
