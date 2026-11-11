import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, ChevronLeft, ChevronRight, ShieldAlert, Timer, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { Table, TableContainer, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { StaffDay, StaffSummary } from '@/types/staffAttendance';
import { displayDate, MONTH_NAMES, shortDuration, tashkentDate, tashkentTime, WEEK_DAY_SHORT } from '@/utils/staffAttendanceLabels';
import { planText, StaffStatusBadge } from './StaffStatus';

export interface YearMonth {
  year: number;
  month: number;
}

/** `2026-11` → { year, month }; noto'g'ri bo'lsa — joriy oy */
export function parseYearMonth(value: string | null): YearMonth {
  const match = value ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null;
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  const today = tashkentDate();
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function formatYearMonth(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

function shiftYearMonth(value: YearMonth, delta: number): YearMonth {
  const index = value.year * 12 + value.month - 1 + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function isFutureMonth(value: YearMonth): boolean {
  return formatYearMonth(value) > tashkentDate().slice(0, 7);
}

// ------------------------------------------------------------------ Katak turlari
type CellKind = 'ontime' | 'late' | 'early' | 'review' | 'absent' | 'excused' | 'notyet' | 'off';

const CELL_META: Record<CellKind, { label: string; className: string }> = {
  ontime: { label: 'O‘z vaqtida', className: 'bg-success-subtle text-success' },
  late: { label: 'Kechikdi (daqiqa)', className: 'bg-warning-subtle text-warning' },
  early: { label: 'Erta ketdi', className: 'bg-info-subtle text-info' },
  review: { label: 'Ketish belgilanmagan', className: 'bg-surface text-danger ring-1 ring-inset ring-danger' },
  absent: { label: 'Kelmadi', className: 'bg-danger-subtle text-danger' },
  excused: { label: 'Sababli / ruxsat', className: 'bg-accent-subtle text-accent' },
  notyet: { label: 'Hali kelmagan', className: 'bg-surface-muted text-fg-subtle' },
  off: { label: 'Dam olish / bayram', className: 'text-fg-subtle' },
};

const LEGEND: ReadonlyArray<{ kind: CellKind; mark: string }> = [
  { kind: 'ontime', mark: '✓' },
  { kind: 'late', mark: '15' },
  { kind: 'early', mark: '↓' },
  { kind: 'review', mark: '?' },
  { kind: 'absent', mark: '✕' },
  { kind: 'excused', mark: 'S' },
  { kind: 'off', mark: '' },
];

export function cellKind(day: Pick<StaffDay, 'status' | 'arrival'>): CellKind {
  switch (day.status) {
    case 'OFF':
      return 'off';
    case 'EXCUSED':
      return 'excused';
    case 'ABSENT':
      return 'absent';
    case 'PENDING_REVIEW':
      return 'review';
    case 'NOT_YET':
      return 'notyet';
    case 'LATE':
      return 'late';
    case 'EARLY_DEPARTURE':
      return 'early';
    default:
      return day.arrival === 'LATE' ? 'late' : 'ontime';
  }
}

function cellMark(day: StaffDay, kind: CellKind): string {
  switch (kind) {
    case 'ontime':
      return '✓';
    case 'late':
      return String(day.lateMinutes);
    case 'early':
      return '↓';
    case 'review':
      return '?';
    case 'absent':
      return '✕';
    case 'excused':
      return 'S';
    case 'notyet':
      return '·';
    default:
      return '';
  }
}

/** Katak ustiga olib borilganda: "12.11 · Kechikdi 25 daq · keldi 09:25, ketdi 18:02" */
function cellTitle(day: StaffDay, kind: CellKind): string {
  const parts = [displayDate(day.date), kind === 'late' ? `Kechikdi ${day.lateMinutes} daq` : CELL_META[kind].label];
  if (day.earlyMinutes > 0 && kind !== 'early') parts.push(`${day.earlyMinutes} daq erta ketdi`);
  if (kind === 'early') parts[1] = `Erta ketdi ${day.earlyMinutes} daq`;
  if (day.checkInAt || day.checkOutAt) parts.push(`keldi ${tashkentTime(day.checkInAt)}, ketdi ${tashkentTime(day.checkOutAt)}`);
  if (day.excuseLabel) parts.push(day.excuseLabel);
  if (day.planKind === 'HOLIDAY' && day.planNote) parts.push(day.planNote);
  if (day.corrected) parts.push('rahbar tuzatgan');
  return parts.join(' · ');
}

function weekdayLabel(date: string): string {
  const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return WEEK_DAY_SHORT[index]?.label ?? '';
}

function MonthSwitcher({ value, onChange }: { value: YearMonth; onChange: (value: YearMonth) => void }) {
  const next = shiftYearMonth(value, 1);
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="icon" aria-label="Oldingi oy" onClick={() => onChange(shiftYearMonth(value, -1))}>
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <span className="min-w-32 text-center text-body font-semibold text-fg">
        {MONTH_NAMES[value.month - 1]} {value.year}
      </span>
      <Button variant="secondary" size="icon" aria-label="Keyingi oy" disabled={isFutureMonth(next)} onClick={() => onChange(next)}>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function SummaryCards({ summary, loading }: { summary: StaffSummary | undefined; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        size="sm"
        title="Davomat"
        value={summary && summary.attendancePercent !== null ? `${summary.attendancePercent}%` : '—'}
        description={summary ? `${summary.attendedDays} / ${summary.expectedDays} ish kuni` : undefined}
        icon={CalendarCheck2}
        tone="primary"
        loading={loading}
      />
      <StatCard size="sm" title="Kechikishlar" value={summary ? `${summary.lateDays} marta` : '—'} description={summary ? `${summary.lateMinutes} daqiqa` : undefined} icon={Timer} tone="warning" loading={loading} />
      <StatCard size="sm" title="Kelmagan kunlar" value={summary?.absentDays ?? 0} description={summary ? `sababli: ${summary.excusedDays}` : undefined} icon={UserX} tone="danger" loading={loading} />
      <StatCard size="sm" title="Ketish belgilanmagan" value={summary?.reviewDays ?? 0} description="tekshiruv kerak" icon={ShieldAlert} tone="danger" loading={loading} />
    </div>
  );
}

// ------------------------------------------------------------------ Oylik jadval (rahbar)
/**
 * Butun jamoaning oyi bitta jadvalda: qatorda xodim, ustunda kun. Katak — o'sha kun holati
 * (o'z vaqtida, necha daqiqa kechikdi, kelmadi, ketishini belgilamadi...). Katak bosilsa — kun tafsiloti va tuzatish.
 */
export function MonthTab({
  value,
  onChange,
  onOpenDay,
  onOpenEmployee,
}: {
  value: YearMonth;
  onChange: (value: YearMonth) => void;
  onOpenDay: (userId: string, date: string) => void;
  onOpenEmployee: (userId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: queryKeys.staffAttendance.teamMonth(value.year, value.month), queryFn: () => staffAttendanceService.teamMonth(value.year, value.month) });
  const today = tashkentDate();

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    const all = query.data?.rows ?? [];
    return needle ? all.filter((row) => `${row.name} ${row.position}`.toLocaleLowerCase('uz').includes(needle)) : all;
  }, [query.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthSwitcher value={value} onChange={onChange} />
        <SearchInput value={search} onChange={setSearch} placeholder="Xodim yoki lavozim" label="Xodim qidirish" className="sm:ml-auto sm:max-w-xs" />
      </div>

      <SummaryCards summary={query.data?.total} loading={query.isPending} />

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-caption text-fg-muted" aria-label="Belgilar">
        {LEGEND.map(({ kind, mark }) => (
          <li key={kind} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn('inline-flex size-5 items-center justify-center rounded-sm text-[11px] font-semibold', CELL_META[kind].className, kind === 'off' && 'bg-surface-muted')}>
              {mark}
            </span>
            {CELL_META[kind].label}
          </li>
        ))}
      </ul>

      <Card>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <TableSkeleton columns={10} />
        ) : query.data.dates.length === 0 ? (
          <p className="p-6 text-center text-body text-fg-subtle">Bu oy hali boshlanmagan</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-body text-fg-subtle">{search ? 'Xodim topilmadi' : 'Davomat yuritiladigan xodim yo‘q'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-caption">
              <caption className="sr-only">
                Xodimlar davomati: {MONTH_NAMES[value.month - 1]} {value.year}
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="sticky left-0 z-10 min-w-44 bg-surface px-3 py-2 text-left font-medium text-fg-muted">
                    Xodim
                  </th>
                  {query.data.dates.map((date) => (
                    <th key={date} scope="col" className={cn('px-0.5 py-1 text-center font-medium', date === today ? 'text-primary' : 'text-fg-muted')}>
                      <span className="block tabular-nums">{date.slice(8, 10)}</span>
                      <span className="block text-[10px] font-normal">{weekdayLabel(date)}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-1.5 py-2 text-center font-medium text-warning" title="Kechikkan kunlar">
                    Kech
                  </th>
                  <th scope="col" className="px-1.5 py-2 text-center font-medium text-danger" title="Kelmagan kunlar">
                    Kelm.
                  </th>
                  <th scope="col" className="px-1.5 py-2 text-center font-medium text-danger" title="Ketish belgilanmagan kunlar">
                    ?
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium text-fg-muted">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const byDate = new Map(row.days.map((day) => [day.date, day]));
                  return (
                    <tr key={row.userId}>
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal">
                        <button type="button" className="focus-ring rounded-sm text-left text-body text-fg hover:underline" onClick={() => onOpenEmployee(row.userId)}>
                          {row.name}
                        </button>
                        <span className="block text-fg-subtle">{row.position}</span>
                      </th>
                      {query.data.dates.map((date) => {
                        const day = byDate.get(date);
                        if (!day) return <td key={date} />;
                        const kind = cellKind(day);
                        const title = cellTitle(day, kind);
                        return (
                          <td key={date} className="px-0.5 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => onOpenDay(row.userId, date)}
                              title={title}
                              aria-label={`${row.name}: ${title}`}
                              className={cn(
                                'focus-ring inline-flex size-7 items-center justify-center rounded-sm text-[11px] font-semibold tabular-nums transition-opacity hover:opacity-80',
                                CELL_META[kind].className,
                                day.corrected && 'underline decoration-dotted',
                              )}
                            >
                              {cellMark(day, kind)}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-1.5 py-1 text-center tabular-nums text-fg-muted">{row.summary.lateDays || ''}</td>
                      <td className="px-1.5 py-1 text-center tabular-nums text-fg-muted">{row.summary.absentDays || ''}</td>
                      <td className="px-1.5 py-1 text-center tabular-nums text-fg-muted">{row.summary.reviewDays || ''}</td>
                      <td className="px-2 py-1 text-right font-semibold tabular-nums">{row.summary.attendancePercent === null ? '—' : `${row.summary.attendancePercent}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-caption text-fg-subtle">
        Katakni bossangiz — o‘sha kunning hodisalari va tuzatish oynasi ochiladi. Xodim nomini bossangiz — uning oyi kunma-kun. Kechikish daqiqasi jadvaldagi kechikish muddati
        (grace) hisobga olingan holda.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Bitta xodimning oyi
/** Rahbar uchun: xodimning oyi kunma-kun (xodimning "Mening davomatim" sahifasidagi bilan bir xil) */
export function EmployeeMonthDrawer({
  userId,
  value,
  onChange,
  onClose,
  onOpenDay,
}: {
  userId: string;
  value: YearMonth;
  onChange: (value: YearMonth) => void;
  onClose: () => void;
  onOpenDay: (userId: string, date: string) => void;
}) {
  const query = useQuery({
    queryKey: queryKeys.staffAttendance.userMonth(userId, value.year, value.month),
    queryFn: () => staffAttendanceService.userMonth(userId, value.year, value.month),
  });

  return (
    <Drawer open onClose={onClose} title={query.data?.name ?? 'Xodim davomati'} description={query.data?.position} size="xl">
      <div className="space-y-4">
        <MonthSwitcher value={value} onChange={onChange} />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <SummaryCards summary={query.data?.summary} loading={query.isPending} />
            {query.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : query.data.days.length === 0 ? (
              <p className="p-6 text-center text-body text-fg-subtle">Bu oyda hali yozuv yo‘q</p>
            ) : (
              <Card>
                <TableContainer>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Sana</TH>
                        <TH>Jadval</TH>
                        <TH>Keldi</TH>
                        <TH>Ketdi</TH>
                        <TH>Ish vaqti</TH>
                        <TH>Holat</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {query.data.days.map((day) => (
                        <TR key={day.date}>
                          <TD className="whitespace-nowrap tabular-nums">
                            <button type="button" className="focus-ring rounded-sm hover:underline" onClick={() => onOpenDay(userId, day.date)}>
                              {displayDate(day.date)}
                            </button>
                            <span className="ml-1 text-caption text-fg-subtle">{weekdayLabel(day.date)}</span>
                          </TD>
                          <TD className="text-fg-muted">{planText(day)}</TD>
                          <TD className="tabular-nums">{tashkentTime(day.checkInAt)}</TD>
                          <TD className="tabular-nums">{tashkentTime(day.checkOutAt)}</TD>
                          <TD className="tabular-nums">{shortDuration(day.workedSeconds)}</TD>
                          <TD>
                            <StaffStatusBadge day={day} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              </Card>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
