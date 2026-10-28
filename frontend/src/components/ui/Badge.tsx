import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Semantik ohanglar — ranglar faqat ma'no beradi (docs/design-system.md) */
const semanticClasses = {
  neutral: 'bg-surface-muted text-fg-muted',
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
} as const;

export type SemanticTone = keyof typeof semanticClasses;

/** Avvalgi rang nomlari saqlanadi (mavjud `*_TONES` jadvallari) — har biri semantik ohangga bog'langan */
const LEGACY_TONES = {
  gray: 'neutral',
  blue: 'primary',
  green: 'success',
  yellow: 'warning',
  red: 'danger',
  purple: 'accent',
} as const satisfies Record<string, SemanticTone>;

export type BadgeTone = keyof typeof LEGACY_TONES | SemanticTone;

export function semanticTone(tone: BadgeTone): SemanticTone {
  return tone in LEGACY_TONES ? LEGACY_TONES[tone as keyof typeof LEGACY_TONES] : (tone as SemanticTone);
}

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone;
  /** Oldida rangli nuqta (atrofida yumshoq halqa) — jonli holat uchun; matn baribir bo'ladi */
  dot?: boolean;
}

export function Badge({ tone = 'gray', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        // To'liq yumaloq; chegara — o'z matn rangining 14% i (ring-soft)
        'ring-soft inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        semanticClasses[semanticTone(tone)],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_18%,transparent)]" />}
      {children}
    </span>
  );
}
