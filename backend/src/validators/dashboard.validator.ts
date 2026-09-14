import { z } from 'zod';

export const CHART_PERIODS = ['day', 'week', 'month'] as const;

export const chartQuerySchema = z.object({
  /** day — oxirgi 14 kun, week — oxirgi 8 hafta, month — oxirgi 6 oy */
  period: z.enum(CHART_PERIODS, 'Davr noto‘g‘ri').default('day'),
});

export const managerStatsQuerySchema = z.object({
  period: z.enum(['month', 'quarter', 'year'], 'Davr noto‘g‘ri').default('month'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

/** Owner paneli: oy yoki sana oralig‘i tanlanmasa — joriy oy (bugungacha) */
export const executiveQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => (value.year === undefined) === (value.month === undefined), {
    path: ['month'],
    message: 'Yil va oyni birga tanlang',
  })
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    path: ['to'],
    message: 'Oraliqning ikkala sanasini tanlang',
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasin',
  })
  .refine(
    (value) => !value.from || !value.to || new Date(value.to).getTime() - new Date(value.from).getTime() <= 366 * 86_400_000,
    { path: ['to'], message: 'Oraliq bir yildan oshmasin' },
  );

export type ChartQuery = z.infer<typeof chartQuerySchema>;
export type ExecutiveQuery = z.infer<typeof executiveQuerySchema>;
export type ManagerStatsQuery = z.infer<typeof managerStatsQuerySchema>;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
