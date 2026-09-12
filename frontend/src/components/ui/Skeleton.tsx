import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800', className)} {...props} />;
}
