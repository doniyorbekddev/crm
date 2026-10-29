import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber } from '@/utils/format';

interface CategoryShareRow {
  id: string;
  name: string;
  total: number;
  count: number;
}

interface CategoryShareCardProps {
  rows: readonly CategoryShareRow[];
  total: number;
  /** Tanlangan kategoriya (ro'yxat filtri) — ajratib ko'rsatiladi */
  selectedId: string;
  /** Bo'lak yoki izoh bosilganda — shu kategoriya bo'yicha filtr (qayta bosilsa bekor) */
  onSelect: (id: string) => void;
  className?: string;
}

/** Kategorial ranglar: holat ma'nosidagi qizil ishlatilmaydi; qolganlari "Boshqalar" (neytral) */
const COLORS = ['bg-chart-brand', 'bg-chart-accent', 'bg-chart-warning', 'bg-chart-positive'] as const;
const SHOWN = COLORS.length;

/**
 * Davr xarajati (yoki tushumi) kategoriyalar kesimida: bitta chiziq — qaysi kategoriya qancha ulush.
 * Uchta alohida karta o'rniga: hamma kategoriya bir qarashda, bosilsa ro'yxat shu kategoriyaga filtrlanadi.
 */
export function CategoryShareCard({ rows, total, selectedId, onSelect, className }: CategoryShareCardProps) {
  const sorted = [...rows].filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, SHOWN);
  const rest = sorted.slice(SHOWN);
  const restTotal = rest.reduce((sum, row) => sum + row.total, 0);
  const percent = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const label = (value: number) => {
    const share = percent(value);
    return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
  };

  if (sorted.length === 0) {
    return (
      <Card className={cn('flex items-center p-4 text-body text-fg-muted', className)}>Tanlangan davrda kategoriyalar bo‘yicha yozuv yo‘q</Card>
    );
  }

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-caption text-fg-muted">Kategoriyalar ulushi</p>
        <p className="text-caption text-fg-subtle">{selectedId ? 'Bekor qilish uchun qayta bosing' : 'Bosing — ro‘yxat filtrlanadi'}</p>
      </div>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-pill" role="img" aria-label={top.map((row) => `${row.name} ${label(row.total)}`).join(', ')}>
        {top.map((row, index) => (
          <span
            key={row.id}
            className={cn('h-full origin-left animate-grow-x transition-opacity duration-normal', COLORS[index], selectedId && selectedId !== row.id && 'opacity-30')}
            style={{ width: `${percent(row.total)}%` }}
          />
        ))}
        {restTotal > 0 && <span className={cn('h-full bg-chart-neutral', selectedId && 'opacity-30')} style={{ width: `${percent(restTotal)}%` }} />}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {top.map((row, index) => (
          <li key={row.id}>
            <button
              type="button"
              aria-pressed={selectedId === row.id}
              onClick={() => onSelect(selectedId === row.id ? '' : row.id)}
              className={cn(
                'focus-ring -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-chip px-1.5 py-1 text-left transition-colors hover:bg-surface-muted',
                selectedId === row.id && 'bg-primary-subtle',
              )}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', COLORS[index])} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-body text-fg">{row.name}</span>
              <span className="shrink-0 text-body font-medium whitespace-nowrap tabular-nums text-fg">{formatMoney(row.total)}</span>
              <span className="w-9 shrink-0 text-right text-caption tabular-nums text-fg-muted">{label(row.total)}</span>
            </button>
          </li>
        ))}
        {restTotal > 0 && (
          <li className="-mx-1.5 flex items-center gap-2 px-1.5 py-1">
            <span className="size-2.5 shrink-0 rounded-full bg-chart-neutral" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-body text-fg-muted">{`Boshqalar · ${formatNumber(rest.length)} ta`}</span>
            <span className="shrink-0 text-body font-medium whitespace-nowrap tabular-nums text-fg-muted">{formatMoney(restTotal)}</span>
            <span className="w-9 shrink-0 text-right text-caption tabular-nums text-fg-muted">{label(restTotal)}</span>
          </li>
        )}
      </ul>
    </Card>
  );
}
