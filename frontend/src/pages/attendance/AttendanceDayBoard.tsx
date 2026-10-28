import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarOff, CheckCircle2, Clock, DoorOpen, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import type { AttendanceDayGroup, AttendanceDayGroupState } from '@/types/attendance';
import { formatDate } from '@/utils/format';
import { AttendanceDayRecords } from './AttendanceDayRecords';

const STATE_LABELS: Record<AttendanceDayGroupState, string> = {
  NOT_STARTED: 'Boshlanmagan',
  IN_PROGRESS: 'Jarayonda',
  COMPLETED: 'Belgilangan',
  CANCELLED: 'Dars bekor qilingan',
};
const STATE_TONES: Record<AttendanceDayGroupState, BadgeTone> = { NOT_STARTED: 'gray', IN_PROGRESS: 'yellow', COMPLETED: 'green', CANCELLED: 'red' };

const WEEK_DAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
/** "2026-09-14" → hafta kuni (sana qatori vaqt zonasiz o'qiladi) */
function weekDayOf(date: string): string {
  return WEEK_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
}

export function groupAttendancePath(groupId: string, date: string): string {
  return `/attendance/groups/${groupId}?date=${date}`;
}

function GroupCard({ group, date }: { group: AttendanceDayGroup; date: string }) {
  const percent = group.students === 0 ? 0 : Math.round((group.marked / group.students) * 100);
  return (
    <li>
      <Link
        to={groupAttendancePath(group.id, date)}
        aria-label={`${group.name} — davomatni ochish`}
        className="focus-ring group flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary hover:bg-surface-muted"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-label font-semibold text-fg">{group.name}</p>
            <p className="truncate text-caption text-fg-muted">{group.courseName}</p>
          </div>
          <Badge tone={STATE_TONES[group.state]}>
            {group.state === 'COMPLETED' && <CheckCircle2 className="size-3" aria-hidden />}
            {STATE_LABELS[group.state]}
          </Badge>
        </div>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-body text-fg-muted">
          <div className="flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden />
            <dt className="sr-only">Dars vaqti</dt>
            <dd className="tabular-nums text-fg">
              {group.startTime}–{group.endTime}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="size-4" aria-hidden />
            <dt className="sr-only">O‘quvchilar</dt>
            <dd>{group.students} o‘quvchi</dd>
          </div>
          {group.room && (
            <div className="flex items-center gap-1.5">
              <DoorOpen className="size-4" aria-hidden />
              <dt className="sr-only">Xona</dt>
              <dd>{group.room}-xona</dd>
            </div>
          )}
        </dl>

        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between text-caption text-fg-muted">
            <span>
              {group.marked} / {group.students} belgilangan
              {group.absent > 0 && <span className="text-danger"> · {group.absent} kelmadi</span>}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              {group.state === 'NOT_STARTED' ? 'Belgilash' : 'Ochish'}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Belgilangan o‘quvchilar" aria-valuemin={0} aria-valuemax={group.students} aria-valuenow={group.marked}>
            <div className={cn('h-full origin-left animate-grow-x rounded-full', group.state === 'COMPLETED' ? 'bg-success-solid' : 'bg-gradient-progress')} style={{ width: `${percent}%` }} />
          </div>
          {!group.isScheduledDay && <p className="mt-1 text-caption text-warning">Jadvaldan tashqari dars</p>}
        </div>
      </Link>
    </li>
  );
}

/**
 * Davomat taxtasi: tanlangan kunga darsi bor guruhlar karta ko'rinishida. Kartani bosish — shu guruh davomati.
 * Bugungi sana serverdan (o'quv markaz vaqti) olinadi — brauzer soati yoki vaqt zonasiga bog'liq emas.
 */
export function AttendanceDayBoard() {
  /** Bo'sh — bugun (sanani server aniqlaydi). URL'da — yangilansa yoki guruhdan qaytilsa ham shu kun ochiq qoladi */
  const [searchParams, setSearchParams] = useSearchParams();
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('day') ?? '') ? searchParams.get('day')! : '';
  const setPicked = (value: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set('day', value);
        else next.delete('day');
        return next;
      },
      { replace: true },
    );
  const query = useQuery({
    queryKey: queryKeys.attendance.day(picked || 'today'),
    queryFn: () => attendanceService.day(picked || undefined),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const isToday = data ? data.date === data.today : picked === '';

  return (
    <section aria-label="Kunlik darslar">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-fg">{isToday ? 'Bugungi darslar' : 'Tanlangan kun darslari'}</h2>
          {data && (
            <p className="text-body text-fg-muted">
              {weekDayOf(data.date)}, {formatDate(data.date)}
              {data.groups.length > 0 && ` · ${data.groups.length} ta guruh`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <Button variant="secondary" onClick={() => setPicked('')}>
              Bugun
            </Button>
          )}
          <Input type="date" aria-label="Sana" className="sm:w-44" value={picked || data?.date || ''} onChange={(event) => setPicked(event.target.value)} />
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : !data ? null : (
        <>
          {data.groups.length === 0 ? (
            <div className="rounded-card border border-border bg-surface">
              <EmptyState
                icon={CalendarOff}
                title={isToday ? 'Bugun dars yo‘q' : 'Bu kunga dars rejalashtirilmagan'}
                description={
                  data.otherGroups.length > 0
                    ? 'Jadval bo‘yicha bu kuni sizning guruhlaringizda dars yo‘q. Boshqa sanani tanlang yoki pastdan guruhni oching.'
                    : 'Sizga biriktirilgan faol guruh topilmadi. Guruh biriktirilgach darslar shu yerda ko‘rinadi.'
                }
              />
            </div>
          ) : (
            <ul className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', query.isPlaceholderData && 'opacity-60')}>
              {data.groups.map((group) => (
                <GroupCard key={group.id} group={group} date={data.date} />
              ))}
            </ul>
          )}

          {data.otherGroups.length > 0 && (
            <details className="mt-4 rounded-card border border-border bg-surface">
              <summary className="focus-ring cursor-pointer rounded-card px-4 py-3 text-body text-fg-muted hover:text-fg">
                Bu kuni jadvalda yo‘q guruhlar ({data.otherGroups.length}) — qo‘shimcha dars belgilash uchun
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {data.otherGroups.map((group) => (
                  <li key={group.id}>
                    <Link to={groupAttendancePath(group.id, data.date)} className="focus-ring flex items-center justify-between gap-3 px-4 py-2.5 text-body hover:bg-surface-muted">
                      <span className="min-w-0 truncate text-fg">
                        {group.name} <span className="text-fg-muted">· {group.courseName}</span>
                      </span>
                      <span className="shrink-0 text-caption text-fg-muted">{group.students} o‘quvchi</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <AttendanceDayRecords date={data.date} />
        </>
      )}
    </section>
  );
}
