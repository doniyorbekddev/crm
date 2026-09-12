import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface SelectProps extends ComponentProps<'select'> {
  invalid?: boolean;
  wrapperClassName?: string;
}

export function Select({ className, wrapperClassName, invalid = false, children, ...props }: SelectProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          'h-10 w-full appearance-none rounded-lg border border-border bg-surface pr-9 pl-3 text-sm text-fg shadow-xs outline-none transition',
          'focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60',
          invalid && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}
