import { useQuery } from '@tanstack/react-query';
import { Flame, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
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

const MEDALS = ['🥇', '🥈', '🥉'];

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
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH className="w-16">O‘rin</TH>
                <TH>O‘quvchi</TH>
                <TH>Kurs / guruh</TH>
                <TH className="text-right">Darslar</TH>
                <TH className="text-right">Keldi / kelmadi</TH>
                <TH className="text-right">Seriya</TH>
                <TH className="text-right">Davomat</TH>
              </tr>
            </THead>
            <TBody>
              {rankingQuery.data.map((row, index) => (
                <TR key={row.studentId} className={cn(index < 3 && 'bg-amber-50/40 dark:bg-amber-950/20')}>
                  <TD className="font-medium whitespace-nowrap text-fg">{MEDALS[index] ?? index + 1}</TD>
                  <TD>
                    <p className="font-medium text-fg">
                      {row.firstName} {row.lastName}
                    </p>
                    <p className="font-mono text-xs text-fg-subtle">{row.code}</p>
                  </TD>
                  <TD>
                    <p className="text-fg">{row.courseName}</p>
                    <p className="text-xs text-fg-muted">{row.groupName ?? 'Guruhsiz'}</p>
                  </TD>
                  <TD className="text-right tabular-nums text-fg-muted">{formatNumber(row.lessons)}</TD>
                  <TD className="text-right tabular-nums text-fg-muted">
                    {formatNumber(row.present)} / {formatNumber(row.absent)}
                  </TD>
                  <TD className="text-right">
                    {row.streak > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                        <Flame className="size-3.5" aria-hidden />
                        {row.streak}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        row.rate >= 90
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.rate >= 75
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {row.rate}%
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}
