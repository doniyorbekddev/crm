import type { SortState } from '@/components/ui/DataTable';

/**
 * Sahifaning "maydon:yo'nalish" saralash holatini DataTable sarlavhalariga bog'laydi — saralashni server bajaradi.
 *
 * `columns`: ustun kaliti → API `sortBy` qiymati. Sarlavha bosilganda: o'sish → kamayish → standart tartib.
 * Standart tartibning o'zi shu ustun bo'yicha bo'lsa, uchinchi bosish yo'nalishni almashtiradi (aks holda bosish "qotib" qoladi).
 */
export function headerSort(
  value: string,
  columns: Readonly<Record<string, string>>,
  fallback: string,
  onChange: (value: string) => void,
): { sort: SortState | null; onSortChange: (next: SortState | null) => void } {
  const [field, direction] = value.split(':');
  const key = Object.keys(columns).find((column) => columns[column] === field);
  return {
    sort: key ? { key, direction: direction === 'asc' ? 'asc' : 'desc' } : null,
    onSortChange: (next) => {
      if (next && columns[next.key]) onChange(`${columns[next.key]}:${next.direction}`);
      else if (key && value === fallback) onChange(`${field}:${direction === 'asc' ? 'desc' : 'asc'}`);
      else onChange(fallback);
    },
  };
}
