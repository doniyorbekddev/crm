import { z } from 'zod';

export const LEADERBOARD_PERIODS = ['week', 'month', 'year', 'all'] as const;

const idSchema = z.string().trim().min(1).max(50);

const optionalText = (max: number) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), z.string().trim().max(max).optional());

export const leaderboardQuerySchema = z.object({
  period: z.enum(LEADERBOARD_PERIODS, 'Davr noto‘g‘ri').default('month'),
  courseId: idSchema.optional(),
  groupId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateXpRuleSchema = z.object({
  name: z.string().trim().min(2, 'Kamida 2 belgi').max(150).optional(),
  description: optionalText(255),
  points: z.coerce.number('Ball raqam bo‘lishi kerak').int('Butun son bo‘lishi kerak').min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export const updateLevelSchema = z.object({
  name: z.string().trim().min(2, 'Kamida 2 belgi').max(100).optional(),
  minXp: z.coerce.number('XP raqam bo‘lishi kerak').int('Butun son bo‘lishi kerak').min(0).max(1_000_000).optional(),
  icon: optionalText(16),
  color: optionalText(20),
});

export const updateBadgeSchema = z.object({
  name: z.string().trim().min(2, 'Kamida 2 belgi').max(100).optional(),
  description: z.string().trim().min(2).max(255).optional(),
  icon: z.string().trim().min(1).max(16).optional(),
  threshold: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(0).max(100_000).optional(),
  ),
  xpReward: z.coerce.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export const manualXpSchema = z.object({
  studentId: z.string('O‘quvchini tanlang').trim().min(1, 'O‘quvchini tanlang').max(50),
  points: z.coerce
    .number('Ball raqam bo‘lishi kerak')
    .int('Butun son bo‘lishi kerak')
    .refine((value) => value !== 0, 'Ball nol bo‘lmasligi kerak')
    .refine((value) => Math.abs(value) <= 10_000, 'Ball juda katta'),
  description: z.string('Izoh yozing').trim().min(3, 'Kamida 3 belgi').max(255, 'Izoh juda uzun'),
});

export const awardBadgeSchema = z.object({
  studentId: z.string('O‘quvchini tanlang').trim().min(1).max(50),
  badgeId: z.string('Nishonni tanlang').trim().min(1).max(50),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type UpdateXpRuleInput = z.infer<typeof updateXpRuleSchema>;
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;
export type UpdateBadgeInput = z.infer<typeof updateBadgeSchema>;
export type ManualXpInput = z.infer<typeof manualXpSchema>;
export type AwardBadgeInput = z.infer<typeof awardBadgeSchema>;
