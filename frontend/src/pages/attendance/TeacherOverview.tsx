import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck, CheckCircle2, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import { MyTeachingCard } from '@/pages/teachers/MyTeachingCard';
import { formatDate, formatNumber, formatPhone } from '@/utils/format';

interface TeacherOverviewProps {
  /** Guruhni jurnalda ochish uchun */
  onSelectGroup: (groupId: string) => void;
}

export function TeacherOverview({ onSelectGroup }: TeacherOverviewProps) {
  const overviewQuery = useQuery({
    queryKey: queryKeys.attendance.teacherOverview,
    queryFn: attendanceService.teacherOverview,
  });

  if (overviewQuery.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
    );
  }

  if (overviewQuery.isError) {
    return <ErrorState error={overviewQuery.error} retrying={overviewQuery.isFetching} onRetry={() => void overviewQuery.refetch()} />;
  }

  const data = overviewQuery.data;
  const pending = data.todayLessons - data.markedLessons;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-caption text-fg-muted">Bugungi darslar</p>
          <p className="mt-1 text-h2 text-fg">{formatNumber(data.todayLessons)}</p>
          <p className="mt-1 text-caption text-fg-muted">{formatDate(data.date)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-fg-muted">Davomat belgilandi</p>
          <p className={cn('mt-1 text-h2', pending > 0 ? 'text-warning' : 'text-success')}>
            {formatNumber(data.markedLessons)} / {formatNumber(data.todayLessons)}
          </p>
          <p className="mt-1 text-caption text-fg-muted">{pending > 0 ? `${pending} ta dars kutilmoqda` : 'Hammasi belgilangan'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-fg-muted">Bugun kelmaganlar</p>
          <p className={cn('mt-1 text-h2', data.todayAbsent.length > 0 ? 'text-danger' : 'text-fg')}>
            {formatNumber(data.todayAbsent.length)}
          </p>
          <p className="mt-1 text-caption text-fg-muted">sababsiz qoldirganlar</p>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-fg-muted">Oylik davomat</p>
          <p
            className={cn(
              'mt-1 text-h2',
              data.monthRate >= 90
                ? 'text-success'
                : data.monthRate >= 75
                  ? 'text-warning'
                  : 'text-danger',
            )}
          >
            {data.monthRate}%
          </p>
          <p className="mt-1 text-caption text-fg-muted">{formatNumber(data.monthCounts.total)} ta belgi</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Mening guruhlarim</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.groups.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Guruh yo‘q" description="Sizga hali guruh biriktirilmagan" />
            ) : (
              <ul className="divide-y divide-border">
                {data.groups.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => onSelectGroup(group.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-label text-fg">{group.name}</p>
                        <p className="truncate text-caption text-fg-muted">
                          {group.courseName} · {group.startTime}–{group.endTime} · {formatNumber(group.students)} o‘quvchi
                        </p>
                      </div>
                      <div className="shrink-0">
                        {!group.isScheduledToday ? (
                          <Badge>Bugun dars yo‘q</Badge>
                        ) : group.markedToday > 0 ? (
                          <Badge tone="green">
                            <CheckCircle2 className="size-3" aria-hidden />
                            Belgilandi
                          </Badge>
                        ) : (
                          <Badge tone="yellow">
                            <AlertTriangle className="size-3" aria-hidden />
                            Kutilmoqda
                          </Badge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Bugun kelmaganlar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.todayAbsent.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Hamma keldi" description="Bugun sababsiz qoldirgan o‘quvchi yo‘q" />
            ) : (
              <ul className="divide-y divide-border">
                {data.todayAbsent.map((student) => (
                  <li key={student.studentId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-body text-fg">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="truncate text-caption text-fg-muted">{student.groupName}</p>
                    </div>
                    <a
                      href={`tel:${student.phone}`}
                      className="inline-flex shrink-0 items-center gap-1.5 text-caption text-primary hover:underline"
                    >
                      <Phone className="size-3.5" aria-hidden />
                      {formatPhone(student.phone)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <MyTeachingCard />
    </div>
  );
}
