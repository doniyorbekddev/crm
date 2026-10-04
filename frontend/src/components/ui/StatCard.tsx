import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

export interface StatTrend {
  /** Ko'rsatiladigan matn: "+12,5%" */
  label: string;
  direction: 'up' | 'down' | 'flat';
  /**
   * O'sish yaxshimi? Standart: `up` — ijobiy. Qarz yoki xarajat uchun `positive: false` bering —
   * rang yo'nalishdan emas, ma'nodan kelib chiqadi.
   */
  positive?: boolean;
}

const TONES = {
  neutral: 'bg-surface-muted text-fg-muted',
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
} as const;

interface StatCardProps {
  title: string;
  /** Tayyor formatlangan qiymat ("1 248", "12,4 mln so‘m") — komponent hisoblamaydi */
  value: ReactNode;
  description?: string;
  /** "+12,5%" (belgisidan yo'nalish aniqlanadi) yoki to'liq obyekt */
  trend?: string | StatTrend | null;
  icon?: LucideIcon;
  /** Ikonka foni ohangi — ko'rsatkichning ma'nosi (masalan qarz — `danger`) */
  tone?: keyof typeof TONES;
  loading?: boolean;
  /** O'ng yuqoridagi amal (havola, menyu) */
  action?: ReactNode;
  className?: string;
}

function normalizeTrend(trend: string | StatTrend): StatTrend {
  if (typeof trend !== 'string') return trend;
  const text = trend.trim();
  const direction = /^[-−–]/.test(text) ? 'down' : /^\+/.test(text) || /[1-9]/.test(text) ? 'up' : 'flat';
  return { label: text, direction: /[1-9]/.test(text) ? direction : 'flat' };
}

/** KPI kartasi: bitta ko'rsatkich, uning o'zgarishi va izohi. Biznes ma'lumoti tashqaridan beriladi. */
export function StatCard({ title, value, description, trend, icon: Icon, tone = 'neutral', loading = false, action, className }: StatCardProps) {
  const resolved = trend ? normalizeTrend(trend) : null;
  const good = resolved ? (resolved.direction === 'flat' ? null : (resolved.direction === 'up') === (resolved.positive ?? true)) : null;
  const TrendIcon = resolved?.direction === 'up' ? ArrowUpRight : resolved?.direction === 'down' ? ArrowDownRight : Minus;

  return (
    <div className={cn('rounded-card border border-border bg-surface p-4', className)} aria-busy={loading || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-control', TONES[tone])}>
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <p className="truncate text-body-sm font-medium text-fg-muted">{title}</p>
        </div>
        {action}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2" aria-hidden>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
      ) : (
        <>
          <p className="mt-3 text-h1 text-fg tabular-nums">{value}</p>
          {(resolved || description) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-fg-muted">
              {resolved && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-medium tabular-nums',
                    good === null ? 'text-fg-muted' : good ? 'text-success' : 'text-danger',
                  )}
                >
                  <TrendIcon className="size-3.5" aria-hidden />
                  {resolved.label}
                </span>
              )}
              {description && <span>{description}</span>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
