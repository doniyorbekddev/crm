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
      return 'bg-chart-positive';
    case 'GOOD':
      return 'bg-brand-500';
    case 'DEVELOPING':
      return 'bg-chart-warning';
    case 'WEAK':
      return 'bg-chart-negative';
    default:
      return 'bg-chart-neutral';
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
      return 'bg-success-subtle text-success';
    case 'GOOD':
      return 'bg-primary-subtle text-primary';
    case 'DEVELOPING':
      return 'bg-warning-subtle text-warning';
    case 'WEAK':
      return 'bg-danger-subtle text-danger';
    default:
      return 'text-fg-subtle';
  }
}
