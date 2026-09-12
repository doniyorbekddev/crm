import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

type PageItem = number | 'gap-start' | 'gap-end';

/** 1 … 4 5 6 … 20 ko‘rinishidagi qisqa sahifalar ro‘yxati */
function pageItems(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const items: PageItem[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) items.push('gap-start');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push('gap-end');
  items.push(totalPages);
  return items;
}

export function Pagination({ page, totalPages, total, limit, onPageChange, disabled = false }: PaginationProps) {
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const buttonClass =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav aria-label="Sahifalar" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-sm text-fg-muted">
        {formatNumber(from)}–{formatNumber(to)} / {formatNumber(total)} ta
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(buttonClass, 'text-fg-muted hover:bg-surface-muted hover:text-fg')}
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            aria-label="Oldingi sahifa"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          {pageItems(page, totalPages).map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-current={item === page ? 'page' : undefined}
                className={cn(
                  buttonClass,
                  item === page
                    ? 'bg-brand-600 text-white'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  'hidden sm:inline-flex',
                  item === page && 'inline-flex',
                )}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="hidden px-1 text-fg-subtle sm:inline" aria-hidden>
                …
              </span>
            ),
          )}
          <button
            type="button"
            className={cn(buttonClass, 'text-fg-muted hover:bg-surface-muted hover:text-fg')}
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
            aria-label="Keyingi sahifa"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </nav>
  );
}
