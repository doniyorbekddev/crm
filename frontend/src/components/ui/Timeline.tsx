import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const TONES = {
  neutral: 'border-border bg-surface-muted text-fg-muted',
  primary: 'border-primary-border bg-primary-subtle text-primary',
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  danger: 'border-danger-border bg-danger-subtle text-danger',
  info: 'border-info-border bg-info-subtle text-info',
} as const;

export interface TimelineItem {
  id: string;
  title: ReactNode;
  /** Tayyor formatlangan vaqt ("12.09.2026 14:30") */
  time?: string;
  description?: ReactNode;
  /** Kim bajargan va h.k. — sarlavha ostidagi kichik matn */
  meta?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  /** Qo'shimcha kontent (izoh, fayl, tugmalar) */
  children?: ReactNode;
}

/** Vaqt chizig'i: voqealar ketma-ketligi (qo'ng'iroq, holat o'zgarishi, to'lov …). Tartibni chaqiruvchi belgilaydi. */
export function Timeline({ items, label, className }: { items: TimelineItem[]; label?: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('relative', className)}>
      {items.map(({ id, title, time, description, meta, icon: Icon, tone = 'neutral', children }, index) => (
        <li key={id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < items.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" />}
          <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-full border', TONES[tone])}>
            {Icon ? <Icon className="size-4" aria-hidden /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-body font-medium text-fg">{title}</p>
              {time && <time className="shrink-0 text-caption text-fg-subtle tabular-nums">{time}</time>}
            </div>
            {meta && <p className="mt-0.5 text-caption text-fg-muted">{meta}</p>}
            {description && <div className="mt-1 text-body text-fg-muted">{description}</div>}
            {children && <div className="mt-2">{children}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
