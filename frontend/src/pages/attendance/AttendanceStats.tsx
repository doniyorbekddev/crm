import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import { paymentsService } from '@/services/payments.service';
import type { AttendanceCounts, AttendanceStatsParams } from '@/types/attendanceAnalytics';
import { formatDate, formatNumber } from '@/utils/format';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Davomat foiziga qarab rang */
function rateTone(rate: number): string {
  if (rate >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 75) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function CountsCard({ label, counts }: { label: string; counts: AttendanceCounts }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', rateTone(counts.rate))}>{counts.rate}%</p>
      <p className="mt-1 text-xs text-fg-muted">
        {formatNumber(counts.total)} ta belgi · keldi {formatNumber(counts.PRESENT)} · kelmadi {formatNumber(counts.ABSENT)}
      </p>
    </Card>
  );
}

export function AttendanceStats() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');

  const params: AttendanceStatsParams = {
    from,
    to,
    ...(courseId ? { courseId } : {}),
    ...(groupId ? { groupId } : {}),
  };

  const statsQuery = useQuery({
    queryKey: queryKeys.attendance.stats(params),
    queryFn: () => attendanceService.stats(params),
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const groupsForCourse = (lookupsQuery.data?.groups ?? []).filter((group) => !courseId || group.courseId === courseId);
  const stats = statsQuery.data;
  const maxBucket = Math.max(1, ...(stats?.buckets ?? []).map((bucket) => bucket.students));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Boshlanish sanasi" className="sm:w-44" />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Tugash sanasi" className="sm:w-44" />
          <Select
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setGroupId('');
            }}
            aria-label="Kurs"
            wrapperClassName="sm:w-52"
          >
            <option value="">Barcha kurslar</option>
            {lookupsQuery.data?.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <Select value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Guruh" wrapperClassName="sm:w-52">
            <option value="">Barcha guruhlar</option>
            {groupsForCourse.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {statsQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : statsQuery.isError ? (
        <ErrorState error={statsQuery.error} retrying={statsQuery.isFetching} onRetry={() => void statsQuery.refetch()} />
      ) : !stats ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CountsCard label="Bugun" counts={stats.today} />
            <CountsCard label="So‘nggi 7 kun" counts={stats.week} />
            <CountsCard label="Shu oy" counts={stats.month} />
            <CountsCard label={`Tanlangan davr (${formatDate(stats.from)} — ${formatDate(stats.to)})`} counts={stats.range} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Davomat foizi bo‘yicha o‘quvchilar</CardTitle>
                <span className="text-xs text-fg-muted">{formatNumber(stats.students)} ta o‘quvchi</span>
              </CardHeader>
              <CardContent>
                {stats.students === 0 ? (
                  <EmptyState icon={CalendarCheck} title="Ma’lumot yo‘q" description="Tanlangan davrda davomat belgilanmagan" />
                ) : (
                  <ul className="space-y-2.5">
                    {stats.buckets.map((bucket) => (
                      <li key={bucket.key}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-fg">{bucket.label}</span>
                          <span className="text-fg-muted tabular-nums">{formatNumber(bucket.students)} ta</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              bucket.key === '0-70' ? 'bg-red-500' : bucket.key === '70-80' ? 'bg-amber-500' : 'bg-emerald-500',
                            )}
                            style={{ width: `${Math.round((bucket.students / maxBucket) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guruhlar kesimi</CardTitle>
                <span className="text-xs text-fg-muted">{formatNumber(stats.sessions)} ta dars</span>
              </CardHeader>
              <CardContent className="p-0">
                {stats.byGroup.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="Guruh topilmadi" description="Filtrlarni o‘zgartirib ko‘ring" />
                ) : (
                  <ul className="divide-y divide-border">
                    {stats.byGroup.map((group) => (
                      <li key={group.groupId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-fg">{group.groupName}</p>
                          <p className="truncate text-xs text-fg-muted">{group.courseName}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn('text-sm font-semibold', rateTone(group.rate))}>{group.rate}%</p>
                          <p className="text-xs text-fg-muted">{formatNumber(group.total)} belgi</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Holatlar taqsimoti</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {ATTENDANCE_STATUS_ORDER.map((status) => (
                <Badge key={status} tone={ATTENDANCE_STATUS_TONES[status]}>
                  {ATTENDANCE_STATUS_LABELS[status]}: {formatNumber(stats.range[status])}
                </Badge>
              ))}
              <Badge>Jami: {formatNumber(stats.range.total)}</Badge>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
