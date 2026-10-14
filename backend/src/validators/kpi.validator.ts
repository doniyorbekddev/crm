import { z } from 'zod';
import { optionalField } from './common.validator.js';
import { monthSchema, yearSchema } from './salary.validator.js';

export const KPI_METRICS = [
  'ACQUIRED_STUDENTS',
  'LEAD_CONVERSION',
  'PAYMENT_COLLECTION',
  'ATTENDANCE_RATE',
  'STUDENT_RETENTION',
  'TASK_COMPLETION',
  'MANUAL',
] as const;

export const EMPLOYEE_POSITIONS = ['ADMINISTRATOR', 'MANAGER', 'SALES_MANAGER', 'CALL_CENTER', 'ACCOUNTANT', 'CLEANER', 'SECURITY', 'OTHER'] as const;

/** "2026-10-01" → UTC kun (@db.Date) */
const dateOnly = z
  .string('Sanani kiriting')
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const name = z.string('Nomini kiriting').trim().min(2, 'Nom kamida 2 belgi').max(120, 'Nom 120 belgidan oshmasin');
const target = z.coerce.number('Maqsad raqam bo‘lishi kerak').positive('Maqsad 0 dan katta bo‘lsin').max(1_000_000_000, 'Maqsad juda katta');
const weight = z.coerce.number('Vazn raqam bo‘lishi kerak').int('Vazn butun son bo‘lsin').min(1, 'Vazn kamida 1%').max(100, 'Vazn 100% dan oshmasin');
const description = z.string().trim().max(500, 'Izoh 500 belgidan oshmasin');

/** Foizli KPI maqsadi 100% dan oshmasin */
function percentTargetValid(value: { metric?: string | undefined; target?: number | undefined }): boolean {
  return value.metric === undefined || value.target === undefined || value.metric === 'ACQUIRED_STUDENTS' || value.target <= 100;
}

export const kpiDefinitionSchema = z
  .object({
    name,
    position: z.enum(EMPLOYEE_POSITIONS, 'Lavozimni tanlang'),
    metric: z.enum(KPI_METRICS, 'O‘lchov usulini tanlang'),
    target,
    weight,
    description: optionalField(description),
    effectiveFrom: dateOnly,
    effectiveTo: optionalField(dateOnly),
  })
  .refine(percentTargetValid, { path: ['target'], message: 'Foizli KPI maqsadi 100% dan oshmasin' })
  .refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'Tugash sanasi boshlanishdan oldin bo‘lmasin',
  });
export type KpiDefinitionInput = z.infer<typeof kpiDefinitionSchema>;

export const kpiDefinitionUpdateSchema = z
  .object({
    name: name.optional(),
    position: z.enum(EMPLOYEE_POSITIONS, 'Lavozimni tanlang').optional(),
    metric: z.enum(KPI_METRICS, 'O‘lchov usulini tanlang').optional(),
    target: target.optional(),
    weight: weight.optional(),
    description: description.optional(),
    effectiveFrom: dateOnly.optional(),
    effectiveTo: dateOnly.nullable().optional(),
    isActive: z.boolean('Holat noto‘g‘ri').optional(),
  })
  .refine(percentTargetValid, { path: ['target'], message: 'Foizli KPI maqsadi 100% dan oshmasin' })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'O‘zgartiriladigan maydon yo‘q');
export type KpiDefinitionUpdateInput = z.infer<typeof kpiDefinitionUpdateSchema>;

export const kpiSettingsSchema = z.object({
  threshold: z.coerce.number('Chegara raqam bo‘lishi kerak').int('Chegara butun son bo‘lsin').min(0, 'Chegara 0–100%').max(100, 'Chegara 0–100%'),
});
export type KpiSettingsInput = z.infer<typeof kpiSettingsSchema>;

export const kpiPoolSchema = z.object({
  kpiBonusPool: z.coerce.number('Summa raqam bo‘lishi kerak').int('Summa butun so‘mda').min(0, 'Summa manfiy bo‘lmasin').max(1_000_000_000, 'Summa juda katta'),
});
export type KpiPoolInput = z.infer<typeof kpiPoolSchema>;

export const kpiManualResultSchema = z.object({
  kpiId: z.string('KPI tanlang').trim().min(1).max(50),
  employeeId: z.string('Xodimni tanlang').trim().min(1).max(50),
  year: yearSchema,
  month: monthSchema,
  actual: z.coerce.number('Natija raqam bo‘lishi kerak').min(0, 'Natija manfiy bo‘lmasin').max(1_000_000_000, 'Natija juda katta'),
  reason: z.string('Sababni kiriting').trim().min(3, 'Sabab kamida 3 belgi').max(255, 'Sabab juda uzun'),
});
export type KpiManualResultInput = z.infer<typeof kpiManualResultSchema>;

export const kpiPreviewQuerySchema = z.object({
  employeeId: z.string('Xodimni tanlang').trim().min(1).max(50),
  year: yearSchema,
  month: monthSchema,
});
