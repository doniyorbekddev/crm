import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { controlClass, controlInvalidClass } from './controlStyles';

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
          controlClass,
          'h-10 px-3',
          leftIcon ? 'pl-9' : undefined,
          rightSlot ? 'pr-11' : undefined,
          invalid && controlInvalidClass,
          className,
        )}
        {...props}
      />
      {rightSlot && <span className="absolute inset-y-0 right-1.5 flex items-center">{rightSlot}</span>}
    </div>
  );
}
