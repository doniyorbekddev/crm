import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ExportMenu } from '@/components/ExportMenu';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useExport } from '@/hooks/useExport';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import type { AttendanceJournal, AttendanceStatus } from '@/types/attendance';
import { WEEK_DAY_SHORT_LABELS } from '@/utils/courseLabels';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

/** Jurnal katagidagi belgi (qog'oz jurnaldagidek) — Excel eksportidagi bilan bir xil */
const JOURNAL_MARKS: Record<AttendanceStatus, string> = { PRESENT: '+', LATE: 'K', EXCUSED: 'S', ABSENT: 'Y' };
const CELL_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success-subtle text-success',
  LATE: 'bg-warning-subtle text-warning',
  EXCUSED: 'bg-info-subtle text-info',
  ABSENT: 'bg-danger-subtle text-danger',
};

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}
function rateTone(rate: number | null) {
  if (rate === null) return 'text-fg-subtle';
  return rate >= 85 ? 'text-success' : rate >= 70 ? 'text-warning' : 'text-danger';
}

/**
 * Guruhning oylik davomat jurnali: qatorda o'quvchi, ustunda dars kunlari, oxirida jami va foiz.
 * Faqat ko'rish va eksport; belgilash kunlik varaqda (ustun sarlavhasi o'sha kunga olib boradi).
 */
export default function GroupAttendanceJournalPage() {
  const { groupId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month') ?? '';
  const month = MONTH_PATTERN.test(monthParam) ? monthParam : '';
  const { exporting, run: runExport } = useExport();

  const journalQuery = useQuery({
    queryKey: queryKeys.attendance.journal(groupId, month),
    queryFn: () => attendanceService.journal(groupId, month || undefined),
    enabled: Boolean(groupId),
    placeholderData: (previous) => previous,
  });
  const journal = journalQuery.data;

  const back = (
    <Link to={`/groups/${groupId}`} className="focus-ring inline-flex items-center gap-1 rounded-sm text-body text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden />
      Guruh
    </Link>
  );

  if (journalQuery.isPending) {
    return (
      <>
        <PageHeader title="Davomat jurnali" breadcrumb={back} />
        <Skeleton className="h-72 w-full" />
      </>
    );
  }
  if (journalQuery.isError || !journal) {
    return (
      <>
        <PageHeader title="Davomat jurnali" breadcrumb={back} />
        <Card>
          <ErrorState error={journalQuery.error} retrying={journalQuery.isFetching} onRetry={() => void journalQuery.refetch()} />
        </Card>
      </>
    );
  }

  const current = monthKey(journal.year, journal.month);
  const go = (next: string) => setSearchParams({ month: next }, { replace: true });
  const label = `${MONTH_NAMES[journal.month - 1]} ${journal.year}`;

  return (
    <>
      <PageHeader
        title={`${journal.group.name} — davomat jurnali`}
        documentTitle={`${journal.group.name} — jurnal ${label}`}
        description={`${journal.group.courseName}${journal.group.teacher ? ` · ${journal.group.teacher}` : ''}`}
        breadcrumb={back}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="icon" aria-label="Oldingi oy" onClick={() => go(shiftMonth(journal.year, journal.month, -1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Input
                type="month"
                aria-label="Oy"
                className="w-40"
                value={current}
                onChange={(event) => {
                  if (MONTH_PATTERN.test(event.target.value)) go(event.target.value);
                }}
              />
              <Button variant="secondary" size="icon" aria-label="Keyingi oy" onClick={() => go(shiftMonth(journal.year, journal.month, 1))}>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
            <Link
              to={`/attendance/groups/${groupId}`}
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-control border border-border px-3 text-body font-medium text-fg hover:bg-surface-muted"
            >
              <CalendarCheck className="size-4" aria-hidden />
              Bugungi davomat
            </Link>
            <ExportMenu
              loading={exporting}
              disabled={journal.students.length === 0}
              onExport={(format) => void runExport(`/groups/${groupId}/attendance/month/export`, { month: current }, `davomat-${journal.group.name}-${current}`, format)}
            />
          </>
        }
      />

      <JournalSummary journal={journal} label={label} />

      <Card className={cn('mt-3', journalQuery.isFetching && 'opacity-70')}>
        {journal.students.length === 0 || journal.days.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={journal.days.length === 0 ? 'Bu oyda dars kuni yo‘q' : 'Guruhda o‘quvchi yo‘q'}
            description={journal.days.length === 0 ? 'Guruh jadvali yoki boshlanish sanasi bu oyga to‘g‘ri kelmaydi' : 'O‘quvchi guruhga qo‘shilgach jurnalda ko‘rinadi'}
          />
        ) : (
          <JournalGrid journal={journal} groupId={groupId} />
        )}
      </Card>

      <p className="mt-2 text-caption text-fg-subtle">
        Belgilar: + keldi, K kechikdi, S sababli, Y kelmadi, · belgilanmagan, × bekor qilingan. Davomat foizi = (keldi + kechikdi) / belgilanganlar. Kun sarlavhasini bossangiz, o‘sha kunning varag‘i ochiladi.
      </p>
    </>
  );
}

function JournalSummary({ journal, label }: { journal: AttendanceJournal; label: string }) {
  const held = journal.days.filter((day) => day.marked > 0).length;
  const cancelled = journal.days.filter((day) => day.session === 'CANCELLED').length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-body font-semibold text-fg">{label}</span>
      <Badge>Dars kunlari: {journal.days.filter((day) => day.scheduled).length}</Badge>
      <Badge>Belgilangan kunlar: {held}</Badge>
      {cancelled > 0 && <Badge tone="yellow">Bekor qilingan: {cancelled}</Badge>}
      {ATTENDANCE_STATUS_ORDER.map((status) => (
        <Badge key={status} tone={ATTENDANCE_STATUS_TONES[status]}>
          {ATTENDANCE_STATUS_LABELS[status]}: {journal.totals[status]}
        </Badge>
      ))}
      <span className={cn('ml-auto text-body font-semibold tabular-nums', rateTone(journal.totals.rate))}>
        Davomat: {journal.totals.rate === null ? '—' : `${journal.totals.rate}%`}
      </span>
    </div>
  );
}

function JournalGrid({ journal, groupId }: { journal: AttendanceJournal; groupId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-caption">
        <caption className="sr-only">Oylik davomat jurnali</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 text-left font-medium text-fg-muted">
              O‘quvchi
            </th>
            {journal.days.map((day) => (
              <th
                key={day.date}
                scope="col"
                className={cn('px-0.5 py-1 text-center font-medium', day.date === journal.today ? 'text-brand-600' : 'text-fg-muted', !day.scheduled && 'bg-surface-muted')}
                title={day.session === 'CANCELLED' ? 'Dars bekor qilingan' : !day.scheduled ? 'Jadvaldan tashqari dars' : undefined}
              >
                <Link to={`/attendance/groups/${groupId}?date=${day.date}`} className="focus-ring block rounded-sm px-1 hover:text-fg">
                  <span className="block tabular-nums">{day.date.slice(8, 10)}</span>
                  <span className="block text-[10px] font-normal">{WEEK_DAY_SHORT_LABELS[day.weekday]}</span>
                </Link>
              </th>
            ))}
            {ATTENDANCE_STATUS_ORDER.map((status) => (
              <th key={status} scope="col" className="px-1.5 py-2 text-center font-medium text-fg-muted" title={ATTENDANCE_STATUS_LABELS[status]}>
                {JOURNAL_MARKS[status]}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-medium text-fg-muted">
              %
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {journal.students.map((student) => (
            <tr key={student.id} className={cn(student.former && 'text-fg-subtle')}>
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal">
                <Link to={`/students/${student.id}`} className="focus-ring rounded-sm text-body text-fg hover:underline">
                  {student.name}
                </Link>
                <span className="block text-fg-subtle">
                  {student.code}
                  {student.extraMember && ' · qo‘shimcha guruh'}
                  {student.former && ' · guruhdan chiqqan'}
                </span>
              </th>
              {journal.days.map((day) => {
                const status = student.cells[day.date];
                return (
                  <td key={day.date} className={cn('px-0.5 py-1 text-center', !day.scheduled && 'bg-surface-muted')}>
                    {status ? (
                      <span className={cn('inline-flex size-6 items-center justify-center rounded-sm font-semibold', CELL_CLASSES[status])} title={`${day.date}: ${ATTENDANCE_STATUS_LABELS[status]}`}>
                        {JOURNAL_MARKS[status]}
                      </span>
                    ) : (
                      <span className="text-fg-subtle" aria-label={day.session === 'CANCELLED' ? 'bekor qilingan' : 'belgilanmagan'}>
                        {day.session === 'CANCELLED' ? '×' : '·'}
                      </span>
                    )}
                  </td>
                );
              })}
              {ATTENDANCE_STATUS_ORDER.map((status) => (
                <td key={status} className="px-1.5 py-1 text-center tabular-nums text-fg-muted">
                  {student.totals[status] || ''}
                </td>
              ))}
              <td className={cn('px-2 py-1 text-right font-semibold tabular-nums', rateTone(student.totals.rate))}>{student.totals.rate === null ? '—' : `${student.totals.rate}%`}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-medium text-fg-muted">
              Kelmaganlar
            </th>
            {journal.days.map((day) => (
              <td key={day.date} className={cn('px-0.5 py-1 text-center tabular-nums', day.absent > 0 ? 'text-danger' : 'text-fg-subtle', !day.scheduled && 'bg-surface-muted')}>
                {day.marked > 0 ? day.absent : ''}
              </td>
            ))}
            <td colSpan={ATTENDANCE_STATUS_ORDER.length + 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
