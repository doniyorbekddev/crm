import { DataTable } from '@/components/ui/DataTable';
import { useQuery } from '@tanstack/react-query';
import { Flame, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import { paymentsService } from '@/services/payments.service';
import type { AttendanceRankingParams } from '@/types/attendanceAnalytics';
import { formatNumber } from '@/utils/format';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const PERIODS = [
  { value: 'month', label: 'Shu oy' },
  { value: 'week', label: 'So‘nggi 7 kun' },
  { value: 'quarter', label: 'So‘nggi 3 oy' },
  { value: 'all', label: 'Butun davr' },
] as const;

type Period = (typeof PERIODS)[number]['value'];

function rangeFor(period: Period): { from?: string; to?: string } {
  const now = new Date();
  const to = isoDate(now);
  switch (period) {
    case 'week': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: isoDate(from), to };
    }
    case 'quarter': {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from: isoDate(from), to };
    }
    case 'all':
      return {};
    case 'month':
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
}

/** Birinchi uch o'rin ajratib ko'rsatiladi (emoji o'rniga belgi) */
function Rank({ place }: { place: number }) {
  return (
    <span
      className={cn(
        'inline-grid size-6 place-items-center rounded-chip text-caption font-semibold tabular-nums',
        place === 1 ? 'bg-warning-subtle text-warning' : place <= 3 ? 'bg-primary-subtle text-primary' : 'text-fg-muted',
      )}
    >
      {place}
    </span>
  );
}

export function AttendanceRanking() {
  const [period, setPeriod] = useState<Period>('month');
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [minLessons, setMinLessons] = useState('3');

  const params: AttendanceRankingParams = {
    ...rangeFor(period),
    ...(courseId ? { courseId } : {}),
    ...(groupId ? { groupId } : {}),
    minLessons: Number(minLessons) || 1,
    limit: 50,
  };

  const rankingQuery = useQuery({
    queryKey: queryKeys.attendance.ranking(params),
    queryFn: () => attendanceService.ranking(params),
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const groupsForCourse = (lookupsQuery.data?.groups ?? []).filter((group) => !courseId || group.courseId === courseId);

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
        <Select value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label="Davr" wrapperClassName="sm:w-44">
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select
          value={courseId}
          onChange={(event) => {
            setCourseId(event.target.value);
            setGroupId('');
          }}
          aria-label="Kurs"
          wrapperClassName="sm:w-48"
        >
          <option value="">Barcha kurslar</option>
          {lookupsQuery.data?.courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
        <Select value={groupId} onChange={(event) => setGroupId(event.target.value)} aria-label="Guruh" wrapperClassName="sm:w-48">
          <option value="">Barcha guruhlar</option>
          {groupsForCourse.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={1}
          max={100}
          value={minLessons}
          onChange={(event) => setMinLessons(event.target.value)}
          aria-label="Eng kam darslar soni"
          className="sm:w-40"
        />
      </div>

      {rankingQuery.isPending ? (
        <TableSkeleton rows={6} columns={5} />
      ) : rankingQuery.isError ? (
        <ErrorState error={rankingQuery.error} retrying={rankingQuery.isFetching} onRetry={() => void rankingQuery.refetch()} />
      ) : rankingQuery.data.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Reyting bo‘sh"
          description="Tanlangan davrda yetarlicha dars belgilanmagan — davrni kengaytiring yoki eng kam darslar sonini kamaytiring"
        />
      ) : (
        <DataTable
          bare
          label="Davomat reytingi"
          rows={rankingQuery.data.map((row, index) => ({ ...row, place: index + 1 }))}
          rowKey={(row) => row.studentId}
          rowClassName={(row) => cn(row.place <= 3 && 'bg-warning-subtle')}
          mobileLayout="cards"
          columns={[
            {
              key: 'c0',
              label: 'O‘rin',
              thClassName: 'w-16',
              tdClassName: 'whitespace-nowrap',
              cell: (row) => (
                <>
                  <Rank place={row.place} />
                </>
              ),
            },
            {
              key: 'c1',
              label: 'O‘quvchi',
              cell: (row) => (
                <>
                  <p className="font-medium text-fg">
                    {row.firstName} {row.lastName}
                  </p>
                  <p className="font-mono text-xs text-fg-subtle">{row.code}</p>
                </>
              ),
            },
            {
              key: 'c2',
              label: 'Kurs / guruh',
              cell: (row) => (
                <>
                  <p className="text-fg">{row.courseName}</p>
                  <p className="text-xs text-fg-muted">{row.groupName ?? 'Guruhsiz'}</p>
                </>
              ),
            },
            {
              key: 'c3',
              label: 'Darslar',
              thClassName: 'text-right',
              tdClassName: 'text-right tabular-nums text-fg-muted',
              cell: (row) => <>{formatNumber(row.lessons)}</>,
            },
            {
              key: 'c4',
              label: 'Keldi / kelmadi',
              thClassName: 'text-right',
              tdClassName: 'text-right tabular-nums text-fg-muted',
              cell: (row) => (
                <>
                  {formatNumber(row.present)} / {formatNumber(row.absent)}
                </>
              ),
            },
            {
              key: 'c5',
              label: 'Seriya',
              thClassName: 'text-right',
              tdClassName: 'text-right',
              cell: (row) => (
                <>
                  {row.streak > 0 ? (
                    <span className="inline-flex items-center gap-1 text-sm text-warning">
                      <Flame className="size-3.5" aria-hidden />
                      {row.streak}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </>
              ),
            },
            {
              key: 'c6',
              label: 'Davomat',
              thClassName: 'text-right',
              tdClassName: 'text-right',
              cell: (row) => (
                <>
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      row.rate >= 90
                        ? 'text-success'
                        : row.rate >= 75
                          ? 'text-warning'
                          : 'text-danger',
                    )}
                  >
                    {row.rate}%
                  </span>
                </>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
