import { cn } from '@/lib/cn';

const SIZES = { sm: 'size-6 text-caption', lg: 'size-9 text-h4' } as const;

/** Reytingdagi o'rin belgisi: birinchi o'rin — oltin tusda, 2–3 — asosiy rangda, qolgani — oddiy raqam */
export function RankMark({ place, size = 'sm' }: { place: number; size?: keyof typeof SIZES }) {
  return (
    <span
      className={cn(
        'inline-grid place-items-center rounded-chip font-semibold tabular-nums',
        SIZES[size],
        place === 1 ? 'bg-warning-subtle text-warning' : place <= 3 ? 'bg-primary-subtle text-primary' : 'text-fg-muted',
      )}
    >
      {place}
    </span>
  );
}
