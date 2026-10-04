import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/Skeleton';

/** Karta sarlavhasidagi "Barchasi" havolasi */
export function CardLink({ to, children = 'Barchasi' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="focus-ring shrink-0 rounded-sm text-caption font-medium text-primary transition-colors hover:underline">
      {children}
    </Link>
  );
}

/** Ro'yxatli karta yuklanayotganda */
export function ListSkeleton({ rows = 3, height = 'h-10' }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`${height} w-full`} />
      ))}
    </div>
  );
}

/** Yorliq — qiymat qatori (Bugun, davr yakunlari) */
export function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <span className="text-body text-fg-muted">{label}</span>
      <span className="text-right">
        <span className="text-body font-medium whitespace-nowrap text-fg tabular-nums">{value}</span>
        {hint && <span className="ml-2 text-caption text-fg-subtle">{hint}</span>}
      </span>
    </div>
  );
}

/** To'ldirish chizig'i (voronka, reja bajarilishi, sog'lomlik) */
export function ProgressBar({ percent, className = 'bg-chart-brand', size = 'md' }: { percent: number; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`overflow-hidden rounded-full bg-surface-muted ${size === 'sm' ? 'h-1.5' : 'h-2'}`} aria-hidden>
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }} />
    </div>
  );
}
