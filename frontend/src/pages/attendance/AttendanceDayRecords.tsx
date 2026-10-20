import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Phone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import type { AttendanceStatus } from '@/types/attendance';
import { formatPhone, formatTime } from '@/utils/format';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

type Filter = AttendanceStatus | 'ALL';

/** Filtr tartibi: avval e'tibor talab qiladiganlar */
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'Hammasi' },
  { value: 'ABSENT', label: 'Kelmaganlar' },
  { value: 'LATE', label: 'Kech qolganlar' },
  { value: 'EXCUSED', label: 'Sababli' },
  { value: 'PRESENT', label: 'Kelganlar' },
];

const CHIP_ACTIVE: Record<Filter, string> = {
  ALL: 'border-primary bg-primary-subtle text-primary',
  ABSENT: 'border-danger-border bg-danger-subtle text-danger',
  LATE: 'border-warning-border bg-warning-subtle text-warning',
  EXCUSED: 'border-info-border bg-info-subtle text-info',
  PRESENT: 'border-success-border bg-success-subtle text-success',
};

/**
 * Kun davomati: tanlangan sanadagi barcha belgilar — kelgan, kech qolgan, sababli, kelmagan — bitta ro'yxatda,
 * holat bo'yicha filtr va qidiruv bilan. Belgilar bazada saqlanadi, shuning uchun o'tgan kunlar ham xuddi shunday ochiladi.
 */
export function AttendanceDayRecords({ date }: { date: string }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: queryKeys.attendance.dayRecords(date),
    queryFn: () => attendanceService.dayRecords(date),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
  const data = query.data;

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    return (data?.items ?? []).filter(
      (row) =>
        (filter === 'ALL' || row.status === filter) &&
        (!needle ||
          `${row.student.firstName} ${row.student.lastName} ${row.student.code} ${row.group.name}`.toLocaleLowerCase('uz').includes(needle)),
    );
  }, [data, filter, search]);

  const countOf = (value: Filter) => (value === 'ALL' ? (data?.counts.total ?? 0) : (data?.counts[value] ?? 0));

  return (
    <section aria-label="Kun davomati" className="mt-6 rounded-card border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-h3 text-fg">Kun davomati</h2>
          <p className="text-caption text-fg-muted">Belgilangan o‘quvchilar holat bo‘yicha — sanani yuqoridagi kalendardan tanlang</p>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="O‘quvchi, kod yoki guruh…" label="Kun davomatida qidirish" className="lg:w-72" />
      </div>

      <div role="group" aria-label="Holat bo‘yicha filtr" className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
        {FILTERS.map((item) => {
          const active = filter === item.value;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(item.value)}
              className={cn(
                'focus-ring inline-flex items-center gap-2 rounded-chip border px-3 py-1.5 text-label transition-colors',
                active ? CHIP_ACTIVE[item.value] : 'border-border text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              {item.label}
              <span className="tabular-nums font-semibold">{countOf(item.value)}</span>
            </button>
          );
        })}
      </div>

      {query.isPending ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={data?.counts.total === 0 ? 'Bu kunda davomat belgilanmagan' : 'Bu holatda o‘quvchi yo‘q'}
          description={data?.counts.total === 0 ? 'Guruh kartasini ochib davomatni belgilang' : 'Boshqa holatni tanlang yoki qidiruvni tozalang'}
        />
      ) : (
        <ul className={cn('divide-y divide-border', query.isPlaceholderData && 'opacity-60')}>
          {rows.map((row) => {
            const contact = row.student.phone ?? row.student.parentPhone;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <Link to={`/students/${row.student.id}`} className="font-medium text-fg hover:text-primary hover:underline">
                    {row.student.lastName} {row.student.firstName}
                  </Link>
                  <p className="text-caption text-fg-muted">
                    <span className="font-mono">{row.student.code}</span> · {row.group.name} · {row.group.courseName} · {row.group.startTime}
                  </p>
                  {row.note && <p className="text-caption text-fg">Izoh: {row.note}</p>}
                </div>
                {contact && (
                  <a href={`tel:${contact}`} className="inline-flex shrink-0 items-center gap-1.5 text-caption text-primary hover:underline">
                    <Phone className="size-3.5" aria-hidden />
                    {row.student.phone ? '' : 'ota-ona: '}
                    {formatPhone(contact)}
                  </a>
                )}
                <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                  <Badge tone={ATTENDANCE_STATUS_TONES[row.status]}>{ATTENDANCE_STATUS_LABELS[row.status]}</Badge>
                  <span className="text-caption text-fg-subtle">
                    {row.markedBy ? `${row.markedBy.firstName} ${row.markedBy.lastName} · ` : ''}
                    {formatTime(row.markedAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
