import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlClass, controlInvalidClass } from './controlStyles';

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
          controlClass,
          'h-10 appearance-none pr-9 pl-3',
          invalid && controlInvalidClass,
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
