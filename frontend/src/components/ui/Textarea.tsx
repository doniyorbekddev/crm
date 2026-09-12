import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ className, invalid = false, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg shadow-xs outline-none transition',
        'placeholder:text-fg-subtle focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60',
        invalid && 'border-red-500 focus:border-red-500 focus:ring-red-500/15',
        className,
      )}
      {...props}
    />
  );
}
