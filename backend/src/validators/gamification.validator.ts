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

export const BADGE_RULES = ['MANUAL', 'STREAK_DAYS', 'ATTENDANCE_RATE', 'HOMEWORK_COUNT', 'EXAM_SCORE', 'XP_TOTAL', 'COURSE_COMPLETED', 'REFERRAL'] as const;
export const BADGE_CATEGORIES = ['ATTENDANCE', 'ACADEMIC', 'ACTIVITY', 'SOCIAL', 'SPECIAL'] as const;

/**
 * Qoida bo'yicha chegara oralig'i (TZ 3.1 GAP-02 talablari: ATTENDANCE → ATTENDANCE_RATE, HOMEWORK →
 * HOMEWORK_COUNT, EXAM → EXAM_SCORE, XP → XP_TOTAL, STREAK → STREAK_DAYS, REFERRAL, COURSE_COMPLETION →
 * COURSE_COMPLETED). `null` — chegara kerak emas (qo'lda beriladi yoki holatga bog'liq).
 */
export const BADGE_THRESHOLD_RANGE: Record<(typeof BADGE_RULES)[number], { min: number; max: number; label: string } | null> = {
  MANUAL: null,
  COURSE_COMPLETED: null,
  STREAK_DAYS: { min: 1, max: 365, label: 'ketma-ket dars' },
  ATTENDANCE_RATE: { min: 1, max: 100, label: 'davomat foizi' },
  HOMEWORK_COUNT: { min: 1, max: 10_000, label: 'topshirilgan vazifa' },
  EXAM_SCORE: { min: 1, max: 100, label: 'imtihon foizi' },
  XP_TOTAL: { min: 1, max: 1_000_000, label: 'jami XP' },
  REFERRAL: { min: 1, max: 100, label: 'o‘quvchi bo‘lgan do‘st' },
};

export const createBadgeSchema = z
  .object({
    name: z.string('Nishon nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(100, 'Nom 100 belgidan oshmasin'),
    description: z.string('Tavsif kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(255, 'Tavsif 255 belgidan oshmasin'),
    icon: z.string('Belgi (emoji) kiritilishi shart').trim().min(1, 'Belgi kiritilishi shart').max(16, 'Belgi juda uzun'),
    category: z.enum(BADGE_CATEGORIES, 'Toifa noto‘g‘ri'),
    rule: z.enum(BADGE_RULES, 'Talab turi noto‘g‘ri'),
    threshold: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.coerce.number('Chegara raqam bo‘lishi kerak').int('Butun son bo‘lishi kerak').optional()),
    xpReward: z.coerce.number('XP raqam bo‘lishi kerak').int('Butun son bo‘lishi kerak').min(0, 'Manfiy bo‘lmasin').max(10_000, 'XP 10 000 dan oshmasin').default(0),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    const range = BADGE_THRESHOLD_RANGE[value.rule];
    if (!range) {
      if (value.threshold !== undefined) ctx.addIssue({ code: 'custom', path: ['threshold'], message: 'Bu talab turida chegara bo‘lmaydi' });
      return;
    }
    if (value.threshold === undefined) {
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: `Chegara kiritilishi shart (${range.label})` });
    } else if (value.threshold < range.min || value.threshold > range.max) {
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: `Chegara ${range.min}–${range.max} oralig‘ida (${range.label})` });
    }
  });

export const updateBadgeSchema = z.object({
  category: z.enum(BADGE_CATEGORIES, 'Toifa noto‘g‘ri').optional(),
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

export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type UpdateXpRuleInput = z.infer<typeof updateXpRuleSchema>;
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;
export type UpdateBadgeInput = z.infer<typeof updateBadgeSchema>;
export type ManualXpInput = z.infer<typeof manualXpSchema>;
export type AwardBadgeInput = z.infer<typeof awardBadgeSchema>;
