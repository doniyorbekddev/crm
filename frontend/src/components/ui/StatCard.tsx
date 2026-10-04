import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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

export type StatTone = keyof typeof TONES;

interface StatCardProps {
  title: string;
  /** Tayyor formatlangan qiymat ("1 248", "12,4 mln so‘m") — komponent hisoblamaydi */
  value: ReactNode;
  description?: ReactNode;
  /** "+12,5%" (belgisidan yo'nalish aniqlanadi) yoki to'liq obyekt */
  trend?: string | StatTrend | null;
  icon?: LucideIcon;
  /** Ikonka foni ohangi — ko'rsatkichning ma'nosi (masalan qarz — `danger`). */
  tone?: StatTone;
  /**
   * Qiymat rangi. Standart — neytral. Faqat ishora ma'no bo'lgan joyda (moliya: foyda/zarar, qarz) ishlatiladi —
   * ikonkasiz ixcham kartalarda holatni ko'rsatishning yagona yo'li.
   */
  valueTone?: 'default' | 'success' | 'warning' | 'danger';
  /** `sm` — zich panellar uchun (12 ta ko'rsatkichli to'r) */
  size?: 'md' | 'sm';
  loading?: boolean;
  /** Berilsa — butun karta havola (tegishli bo'limga) */
  to?: string;
  /** O'ng yuqoridagi amal (menyu). `to` bilan birga ishlatilmaydi. */
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
export function StatCard({ title, value, description, trend, icon: Icon, tone = 'neutral', valueTone = 'default', size = 'md', loading = false, to, action, className }: StatCardProps) {
  const resolved = trend ? normalizeTrend(trend) : null;
  const good = resolved ? (resolved.direction === 'flat' ? null : (resolved.direction === 'up') === (resolved.positive ?? true)) : null;
  const TrendIcon = resolved?.direction === 'up' ? ArrowUpRight : resolved?.direction === 'down' ? ArrowDownRight : Minus;
  const small = size === 'sm';

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 font-medium text-fg-muted', small ? 'text-caption' : 'truncate text-body-sm')}>{title}</p>
        {Icon ? (
          <span className={cn('grid shrink-0 place-items-center rounded-control', small ? 'size-7' : 'size-8', TONES[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : (
          action
        )}
      </div>
      {loading ? (
        <div className="mt-2 space-y-2" aria-hidden>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
      ) : (
        <>
          <p
            className={cn(
              'tabular-nums',
              valueTone === 'success' ? 'text-success' : valueTone === 'danger' ? 'text-danger' : valueTone === 'warning' ? 'text-warning' : 'text-fg',
              small ? 'mt-1 text-h3 sm:text-h2' : 'mt-2 text-h1',
            )}
          >
            {value}
          </p>
          {(resolved || description) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-fg-muted">
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
              {description && <span className="min-w-0">{description}</span>}
            </div>
          )}
        </>
      )}
      {Icon && action}
    </>
  );

  const base = cn('block h-full min-w-0 rounded-card border border-border bg-surface', small ? 'p-3 sm:p-4' : 'p-4', className);
  if (to) {
    return (
      <Link to={to} aria-busy={loading || undefined} className={cn(base, 'focus-ring transition-colors hover:border-fg-subtle/50 hover:bg-surface-muted/50')}>
        {body}
      </Link>
    );
  }
  return (
    <div className={base} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
