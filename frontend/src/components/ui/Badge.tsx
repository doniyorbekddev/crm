import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const toneClasses = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  yellow: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  purple: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
} as const;

export type BadgeTone = keyof typeof toneClasses;

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'gray', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
