import type { BadgeTone } from '@/components/ui/Badge';
import type { MasteryLevel, MasteryStatus } from '@/types/mastery';

export const MASTERY_STATUS_LABELS: Record<MasteryStatus, string> = {
  NOT_STARTED: 'Boshlanmagan',
  LEARNING: 'O‘rganilmoqda',
  PRACTICING: 'Mustahkamlanmoqda',
  MASTERED: 'O‘zlashtirilgan',
};

export const MASTERY_STATUS_TONES: Record<MasteryStatus, BadgeTone> = {
  NOT_STARTED: 'gray',
  LEARNING: 'yellow',
  PRACTICING: 'blue',
  MASTERED: 'green',
};

export const MASTERY_LEVEL_LABELS: Record<MasteryLevel, string> = {
  WEAK: 'Zaif',
  DEVELOPING: 'Rivojlanmoqda',
  GOOD: 'Yaxshi',
  MASTERED: 'O‘zlashtirilgan',
};

/** Baho rangi (chiziq va katak) — daraja bo'yicha */
export function masteryBarClass(level: MasteryLevel | null): string {
  switch (level) {
    case 'MASTERED':
      return 'bg-emerald-500';
    case 'GOOD':
      return 'bg-brand-500';
    case 'DEVELOPING':
      return 'bg-amber-500';
    case 'WEAK':
      return 'bg-red-500';
    default:
      return 'bg-slate-300 dark:bg-slate-700';
  }
}

/** Sozlamalar asosida daraja (guruh matritsasi uchun — server faqat bahoni beradi) */
export function levelFor(score: number | null, thresholds: { developing: number; good: number; mastered: number }): MasteryLevel | null {
  if (score === null) return null;
  if (score >= thresholds.mastered) return 'MASTERED';
  if (score >= thresholds.good) return 'GOOD';
  if (score >= thresholds.developing) return 'DEVELOPING';
  return 'WEAK';
}

export function masteryCellClass(level: MasteryLevel | null): string {
  switch (level) {
    case 'MASTERED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case 'GOOD':
      return 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-200';
    case 'DEVELOPING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    case 'WEAK':
      return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
    default:
      return 'text-fg-subtle';
  }
}
