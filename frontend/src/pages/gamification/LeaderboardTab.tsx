import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Flame, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { gamificationService } from '@/services/gamification.service';
import { paymentsService } from '@/services/payments.service';
import type { LeaderboardParams, LeaderboardPeriod } from '@/types/gamification';
import { formatNumber } from '@/utils/format';
import { LEADERBOARD_PERIODS, RANK_MEDALS, formatXp } from '@/utils/gamificationLabels';

interface LeaderboardTabProps {
  onSelectStudent: (studentId: string) => void;
}

export function LeaderboardTab({ onSelectStudent }: LeaderboardTabProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('month');
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');

  const params: LeaderboardParams = {
    period,
    limit: 50,
    ...(courseId ? { courseId } : {}),
    ...(groupId ? { groupId } : {}),
  };

  const leaderboardQuery = useQuery({
    queryKey: queryKeys.gamification.leaderboard(params),
    queryFn: () => gamificationService.leaderboard(params),
    placeholderData: keepPreviousData,
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const groupsForCourse = (lookupsQuery.data?.groups ?? []).filter((group) => !courseId || group.courseId === courseId);
  const rows = leaderboardQuery.data ?? [];
  const top = rows.slice(0, 3);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <div role="tablist" aria-label="Davr" className="flex gap-1">
            {LEADERBOARD_PERIODS.map((item) => {
              const active = period === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(item.value)}
                  className={cn(
                    'h-9 rounded-lg px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <Select
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setGroupId('');
            }}
            aria-label="Kurs"
            wrapperClassName="sm:w-52 sm:ml-auto"
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
        </div>
      </Card>

      {top.length === 3 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[top[1], top[0], top[2]].map((row, index) =>
            row ? (
              <button
                key={row.studentId}
                type="button"
                onClick={() => onSelectStudent(row.studentId)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  index === 1
                    ? 'border-amber-300 bg-amber-50/60 sm:-mt-3 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <p className="text-2xl">{RANK_MEDALS[row.rank - 1] ?? row.rank}</p>
                <p className="mt-1 truncate text-sm font-semibold text-fg">
                  {row.firstName} {row.lastName}
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {row.courseName}
                  {row.groupName && ` · ${row.groupName}`}
                </p>
                <p className="mt-2 text-lg font-bold text-brand-600 dark:text-brand-300">{formatXp(row.xp)}</p>
                <p className="text-xs text-fg-muted">
                  {row.levelName} · {row.badges} nishon
                </p>
              </button>
            ) : null,
          )}
        </div>
      )}

      <Card>
        {leaderboardQuery.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : leaderboardQuery.isError ? (
          <ErrorState error={leaderboardQuery.error} retrying={leaderboardQuery.isFetching} onRetry={() => void leaderboardQuery.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Reyting bo‘sh"
            description="Tanlangan davrda XP to‘plangan emas — davomat belgilanganda XP avtomatik beriladi"
          />
        ) : (
          <TableContainer className={cn('transition-opacity', leaderboardQuery.isPlaceholderData && 'opacity-60')}>
            <Table>
              <THead>
                <tr>
                  <TH className="w-16">O‘rin</TH>
                  <TH>O‘quvchi</TH>
                  <TH>Kurs / guruh</TH>
                  <TH>Daraja</TH>
                  <TH className="text-right">Seriya</TH>
                  <TH className="text-right">Nishon</TH>
                  <TH className="text-right">XP</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR
                    key={row.studentId}
                    onClick={() => onSelectStudent(row.studentId)}
                    className={cn('cursor-pointer', row.rank <= 3 && 'bg-amber-50/40 dark:bg-amber-950/20')}
                  >
                    <TD className="font-medium whitespace-nowrap text-fg">{RANK_MEDALS[row.rank - 1] ?? row.rank}</TD>
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
                    <TD>
                      <Badge tone="blue">
                        {row.levelNumber}-daraja · {row.levelName}
                      </Badge>
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
                    <TD className="text-right tabular-nums text-fg-muted">{formatNumber(row.badges)}</TD>
                    <TD className="text-right font-semibold whitespace-nowrap text-fg">{formatXp(row.xp)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  );
}
