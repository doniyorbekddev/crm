import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'ref'> {
  /** Guruhdagi ba’zi elementlar tanlangan holat (—) */
  indeterminate?: boolean;
}

export function Checkbox({ indeterminate = false, className, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'size-4 cursor-pointer rounded border-border accent-brand-600 outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
