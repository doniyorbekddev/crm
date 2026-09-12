import { cn } from '@/lib/cn';
import { appEnv } from '@/lib/env';

interface BrandMarkProps {
  showName?: boolean;
  inverted?: boolean;
  className?: string;
}

export function BrandMark({ showName = true, inverted = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <div
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold',
          inverted ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-brand-600 text-white',
        )}
      >
        {appEnv.appName.slice(0, 2).toUpperCase()}
      </div>
      {showName && (
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', inverted ? 'text-white' : 'text-fg')}>{appEnv.appName}</p>
          <p className={cn('truncate text-xs', inverted ? 'text-white/70' : 'text-fg-muted')}>Sales CRM</p>
        </div>
      )}
    </div>
  );
}
