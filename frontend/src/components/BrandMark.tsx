import { useState } from 'react';
import { useBranding } from '@/hooks/useBranding';
import { cn } from '@/lib/cn';

interface BrandMarkProps {
  showName?: boolean;
  inverted?: boolean;
  className?: string;
}

/** Markaz logosi va nomi — "Markaz ma'lumotlari" sozlamasidan (logo bo'lmasa — bosh harflar) */
export function BrandMark({ showName = true, inverted = false, className }: BrandMarkProps) {
  const { name, logoUrl } = useBranding();
  const [failed, setFailed] = useState<string | null>(null);
  const showLogo = logoUrl !== null && failed !== logoUrl;

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {showLogo ? (
        <img
          src={logoUrl}
          alt={showName ? '' : `${name} logosi`}
          className={cn('size-9 shrink-0 rounded-xl object-contain', inverted ? 'bg-white/90 ring-1 ring-white/25' : 'bg-surface ring-1 ring-border')}
          onError={() => setFailed(logoUrl)}
        />
      ) : (
        <div
          aria-hidden={showName}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold',
            inverted ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-brand-600 text-white',
          )}
        >
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      {showName && (
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', inverted ? 'text-white' : 'text-fg')}>{name}</p>
          <p className={cn('truncate text-xs', inverted ? 'text-white/70' : 'text-fg-muted')}>Academy CRM</p>
        </div>
      )}
    </div>
  );
}
