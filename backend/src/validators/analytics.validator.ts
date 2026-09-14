import { z } from 'zod';

export const PROFITABILITY_DIMENSIONS = ['course', 'group', 'teacher'] as const;

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

const rangeFields = {
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
};

/** Oraliq: ikkala sana birga, tartib to‘g‘ri va bir yildan oshmaydi */
function checkRange(value: { from?: string | undefined; to?: string | undefined }, ctx: z.RefinementCtx): void {
  if ((value.from === undefined) !== (value.to === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Oraliqning ikkala sanasini tanlang' });
    return;
  }
  if (!value.from || !value.to) return;
  if (value.from > value.to) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasin' });
  } else if (new Date(value.to).getTime() - new Date(value.from).getTime() > 366 * 86_400_000) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Oraliq bir yildan oshmasin' });
  }
}

/** Sana berilmasa — so‘nggi 3 oy (joriy oy bilan) */
export const analyticsRangeQuerySchema = z.object(rangeFields).superRefine(checkRange);

export const profitabilityQuerySchema = z
  .object({
    ...rangeFields,
    dimension: z.enum(PROFITABILITY_DIMENSIONS, 'Kesim noto‘g‘ri').default('course'),
  })
  .superRefine(checkRange);

export const cohortQuerySchema = z.object({
  months: z.coerce.number('Oylar soni raqam bo‘lishi kerak').int().min(3, 'Kamida 3 oy').max(12, 'Ko‘pi bilan 12 oy').default(6),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;
export type ProfitabilityQuery = z.infer<typeof profitabilityQuerySchema>;
export type ProfitabilityDimension = (typeof PROFITABILITY_DIMENSIONS)[number];
export type CohortQuery = z.infer<typeof cohortQuerySchema>;
