import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export function Input({ className, invalid = false, leftIcon, rightSlot, ...props }: InputProps) {
  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-subtle">{leftIcon}</span>
      )}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-xs outline-none transition',
          'placeholder:text-fg-subtle focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
          leftIcon ? 'pl-9' : undefined,
          rightSlot ? 'pr-11' : undefined,
          invalid && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
          className,
        )}
        {...props}
      />
      {rightSlot && <span className="absolute inset-y-0 right-1.5 flex items-center">{rightSlot}</span>}
    </div>
  );
}
