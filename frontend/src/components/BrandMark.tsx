import { useState } from 'react';
import { useBranding } from '@/hooks/useBranding';
import { cn } from '@/lib/cn';

interface BrandMarkProps {
  showName?: boolean;
  /** To'q "stage" sirt ustida (login art paneli) */
  inverted?: boolean;
  className?: string;
}

/**
 * Markaz logosi va nomi — "Markaz ma'lumotlari" sozlamasidan (logo bo'lmasa — brend gradientli bosh harflar).
 * Hoverda ichki elementlar birin-ketin "o'sadi" (faqat transform; reduced-motion'da harakatsiz).
 */
export function BrandMark({ showName = true, inverted = false, className }: BrandMarkProps) {
  const { name, logoUrl } = useBranding();
  const [failed, setFailed] = useState<string | null>(null);
  const showLogo = logoUrl !== null && failed !== logoUrl;
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className={cn('group/brand flex min-w-0 items-center gap-3', className)}>
      {showLogo ? (
        <img
          src={logoUrl}
          alt={showName ? '' : `${name} logosi`}
          className={cn(
            'size-8 shrink-0 rounded-control object-contain transition-transform duration-normal ease-spring group-hover/brand:scale-105',
            inverted ? 'bg-white/90 ring-1 ring-stage-line' : 'bg-surface ring-1 ring-border',
          )}
          onError={() => setFailed(logoUrl)}
        />
      ) : (
        <div
          aria-hidden={showName}
          role={showName ? undefined : 'img'}
          aria-label={showName ? undefined : name}
          className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-control bg-gradient-brand-strong text-caption font-bold text-white shadow-on-color transition-transform duration-normal ease-spring group-hover/brand:scale-105"
        >
          {/* Ichki elementlar birin-ketin o'sadi: belgi → harflar (60ms) → nom (120ms) */}
          <span className="inline-block transition-transform delay-[60ms] duration-normal ease-spring group-hover/brand:scale-110">{initials}</span>
        </div>
      )}
      {showName && (
        <div className="min-w-0 transition-transform delay-[120ms] duration-normal ease-out group-hover/brand:translate-x-0.5">
          <p className={cn('truncate text-body font-semibold tracking-tight', inverted ? 'text-stage-fg' : 'text-fg')}>{name}</p>
          <p className={cn('truncate text-caption', inverted ? 'text-stage-muted' : 'text-fg-muted')}>Academy CRM</p>
        </div>
      )}
    </div>
  );
}
