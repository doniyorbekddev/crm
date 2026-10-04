import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface BreadcrumbItem {
  label: string;
  /** Berilmasa — oddiy matn (oxirgi band: joriy sahifa) */
  to?: string;
}

/** "Men qayerdaman?" — sahifa yo'li. Oxirgi band joriy sahifa (`aria-current="page"`). */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Sahifa yo‘li" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-caption text-fg-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="min-w-0">
                {item.to && !last ? (
                  <Link to={item.to} className="focus-ring rounded-sm transition-colors hover:text-fg">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={cn('block max-w-[40ch] truncate', last && 'font-medium text-fg')}>
                    {item.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-fg-subtle">
                  <ChevronRight className="size-3.5" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
