import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Yuklanish o'rni: sirt ustidan sekin o'tuvchi shimmer (1.6s, ease-in-out). Reduced-motion'da harakatsiz */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-chip bg-skeleton after:absolute after:inset-0 after:animate-shimmer after:bg-(image:--app-shimmer)',
        className,
      )}
      {...props}
    />
  );
}
