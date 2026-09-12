import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

/** Kichik ekranlarda jadval gorizontal aylantiriladi — sahifaning o‘zi emas. */
export function TableContainer({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-surface-muted/70 text-left text-xs text-fg-muted', className)} {...props} />;
}

export function TBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t border-border transition-colors hover:bg-surface-muted/50', className)} {...props} />;
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-4 py-3 font-medium whitespace-nowrap', className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          {Array.from({ length: columns - 1 }, (_, column) => (
            <Skeleton key={column} className={cn('h-4', column === 0 ? 'w-48' : 'hidden w-24 sm:block')} />
          ))}
        </div>
      ))}
    </div>
  );
}
