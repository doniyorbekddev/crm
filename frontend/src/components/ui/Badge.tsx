import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Semantik ohanglar — ranglar faqat ma'no beradi (docs/design-system.md) */
const semanticClasses = {
  neutral: 'bg-surface-muted text-fg-muted ring-border',
  primary: 'bg-primary-subtle text-primary ring-primary-border',
  success: 'bg-success-subtle text-success ring-success-border',
  warning: 'bg-warning-subtle text-warning ring-warning-border',
  danger: 'bg-danger-subtle text-danger ring-danger-border',
  info: 'bg-info-subtle text-info ring-info-border',
  accent: 'bg-accent-subtle text-accent ring-accent-border',
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
}

export function Badge({ tone = 'gray', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-caption font-medium whitespace-nowrap ring-1 ring-inset',
        semanticClasses[semanticTone(tone)],
        className,
      )}
      {...props}
    />
  );
}
