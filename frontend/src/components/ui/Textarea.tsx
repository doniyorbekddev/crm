import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlClass, controlInvalidClass } from './controlStyles';

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ className, invalid = false, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        controlClass,
        'min-h-24 px-3 py-2',
        invalid && controlInvalidClass,
        className,
      )}
      {...props}
    />
  );
}
