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

/** Owner paneli: oy tanlanmasa — joriy oy */
export const executiveQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type ChartQuery = z.infer<typeof chartQuerySchema>;
export type ExecutiveQuery = z.infer<typeof executiveQuerySchema>;
export type ManagerStatsQuery = z.infer<typeof managerStatsQuerySchema>;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
