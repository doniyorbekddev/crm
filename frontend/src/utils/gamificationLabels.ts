import type { BadgeTone } from '@/components/ui/Badge';
import type { BadgeRule, LeaderboardPeriod, XpSource } from '@/types/gamification';

export const XP_SOURCE_LABELS: Record<XpSource, string> = {
  ATTENDANCE: 'Davomat',
  HOMEWORK: 'Uy vazifasi',
  EXAM: 'Imtihon',
  STREAK: 'Ketma-ketlik',
  REFERRAL: 'Tavsiya',
  COURSE_COMPLETED: 'Kurs yakuni',
  BADGE: 'Nishon',
  MANUAL: 'Qo‘lda',
};

export const XP_SOURCE_TONES: Record<XpSource, BadgeTone> = {
  ATTENDANCE: 'green',
  HOMEWORK: 'blue',
  EXAM: 'purple',
  STREAK: 'yellow',
  REFERRAL: 'blue',
  COURSE_COMPLETED: 'purple',
  BADGE: 'yellow',
  MANUAL: 'gray',
};

export const BADGE_RULE_LABELS: Record<BadgeRule, string> = {
  MANUAL: 'Qo‘lda beriladi',
  STREAK_DAYS: 'Ketma-ket darslar',
  ATTENDANCE_RATE: 'Davomat foizi',
  HOMEWORK_COUNT: 'Uy vazifalari soni',
  EXAM_SCORE: 'Imtihon natijasi',
  XP_TOTAL: 'Jami XP',
  COURSE_COMPLETED: 'Kursni tugatish',
};

/** Qoida chegarasi qanday o‘lchovda ko‘rsatiladi */
export const BADGE_RULE_UNITS: Record<BadgeRule, string> = {
  MANUAL: '',
  STREAK_DAYS: 'dars',
  ATTENDANCE_RATE: '%',
  HOMEWORK_COUNT: 'ta',
  EXAM_SCORE: '%',
  XP_TOTAL: 'XP',
  COURSE_COMPLETED: '',
};

export const LEADERBOARD_PERIODS: ReadonlyArray<{ value: LeaderboardPeriod; label: string }> = [
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Oy' },
  { value: 'year', label: 'Yil' },
  { value: 'all', label: 'Butun davr' },
];

export const RANK_MEDALS = ['🥇', '🥈', '🥉'] as const;

/** XP ni qisqa ko‘rinishda: 2450 → "2 450 XP" */
export function formatXp(value: number): string {
  return `${new Intl.NumberFormat('uz-UZ').format(value)} XP`;
}
