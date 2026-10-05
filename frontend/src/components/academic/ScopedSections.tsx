import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, CalendarCheck, FileCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CardHeader, CardTitle } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService, attendanceSessionsService } from '@/services/attendance.service';
import { examsService, homeworkService } from '@/services/homework.service';
import type { SessionListParams } from '@/types/attendanceAnalytics';
import type { ExamListParams, HomeworkListParams } from '@/types/homework';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';

/**
 * Bitta guruh yoki bitta o'qituvchi doirasidagi bo'limlar (guruh va o'qituvchi sahifalarida).
 * Hammasi mavjud ro'yxat API'laridan: `groupId` / `teacherId` filtri bilan, eng so'nggi yozuvlar.
 */
export interface AcademicScope {
  groupId?: string;
  /** Foydalanuvchi ID (o'qituvchi profili emas) */
  teacherId?: string;
}

const LIMIT = 10;

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="focus-ring rounded-chip text-caption font-medium text-primary hover:underline">
      Barchasini ko‘rish
    </Link>
  );
}

export function HomeworkSection({ scope }: { scope: AcademicScope }) {
  const params: HomeworkListParams = { page: 1, limit: LIMIT, sortBy: 'deadline', sortOrder: 'desc', ...scope };
  const query = useQuery({ queryKey: queryKeys.homework.list(params), queryFn: () => homeworkService.list(params) });
  return (
    <DataTable
      label="Uy vazifalari"
      header={
        <CardHeader className="items-center">
          <CardTitle>Uy vazifalari</CardTitle>
          <div className="flex items-center gap-3">
            {query.data && <span className="text-caption text-fg-muted tabular-nums">{formatNumber(query.data.meta.total)} ta</span>}
            <ViewAll to="/homework" />
          </div>
        </CardHeader>
      }
      rows={query.data?.items}
      rowKey={(row) => row.id}
      loading={query.isPending}
      error={query.error}
      retrying={query.isFetching}
      onRetry={() => void query.refetch()}
      empty={{ icon: BookOpenCheck, title: 'Uy vazifasi yo‘q', description: 'Vazifa berilgach shu yerda ko‘rinadi' }}
      mobileLayout="cards"
      columns={[
        {
          key: 'title',
          label: 'Vazifa',
          cell: (row) => (
            <>
              <p className="font-medium text-fg">{row.title}</p>
              <p className="text-caption text-fg-muted">{scope.groupId ? (row.topic?.title ?? row.course?.name ?? '—') : row.group.name}</p>
            </>
          ),
        },
        {
          key: 'deadline',
          label: 'Muddat',
          tdClassName: (row) => (row.isOverdue ? 'whitespace-nowrap text-danger' : 'whitespace-nowrap text-fg-muted'),
          cell: (row) => formatDateTime(row.deadline),
        },
        {
          key: 'submitted',
          label: 'Topshirgan',
          align: 'right',
          tdClassName: 'text-fg-muted',
          cell: (row) => `${formatNumber(row.stats.submitted)} / ${formatNumber(row.stats.students)}`,
        },
        {
          key: 'average',
          label: 'O‘rtacha ball',
          align: 'right',
          tdClassName: 'text-fg-muted',
          cell: (row) => (row.stats.graded > 0 ? formatNumber(row.stats.averageScore) : '—'),
        },
        { key: 'status', label: 'Holat', cell: (row) => <StatusBadge kind="homework" status={row.status} /> },
      ]}
    />
  );
}

export function ExamSection({ scope }: { scope: AcademicScope }) {
  const params: ExamListParams = { page: 1, limit: LIMIT, sortBy: 'date', sortOrder: 'desc', ...scope };
  const query = useQuery({ queryKey: queryKeys.exams.list(params), queryFn: () => examsService.list(params) });
  return (
    <DataTable
      label="Imtihonlar"
      header={
        <CardHeader className="items-center">
          <CardTitle>Imtihonlar</CardTitle>
          <div className="flex items-center gap-3">
            {query.data && <span className="text-caption text-fg-muted tabular-nums">{formatNumber(query.data.meta.total)} ta</span>}
            <ViewAll to="/exams" />
          </div>
        </CardHeader>
      }
      rows={query.data?.items}
      rowKey={(row) => row.id}
      loading={query.isPending}
      error={query.error}
      retrying={query.isFetching}
      onRetry={() => void query.refetch()}
      empty={{ icon: FileCheck, title: 'Imtihon yo‘q', description: 'Imtihon rejalashtirilgach shu yerda ko‘rinadi' }}
      mobileLayout="cards"
      columns={[
        {
          key: 'title',
          label: 'Imtihon',
          cell: (row) => (
            <>
              <p className="font-medium text-fg">{row.title}</p>
              <p className="text-caption text-fg-muted">{scope.groupId ? (row.course?.name ?? '—') : row.group.name}</p>
            </>
          ),
        },
        { key: 'date', label: 'Sana', tdClassName: 'whitespace-nowrap text-fg-muted', cell: (row) => formatDate(row.date) },
        {
          key: 'graded',
          label: 'Baholangan',
          align: 'right',
          tdClassName: 'text-fg-muted',
          cell: (row) => `${formatNumber(row.stats.graded)} / ${formatNumber(row.stats.students)}`,
        },
        {
          key: 'average',
          label: 'O‘rtacha',
          align: 'right',
          tdClassName: 'text-fg-muted',
          cell: (row) => (row.stats.graded > 0 ? `${row.stats.averagePercentage}%` : '—'),
        },
        {
          key: 'pass',
          label: 'O‘tganlar',
          align: 'right',
          tdClassName: 'text-fg-muted',
          cell: (row) => (row.stats.graded > 0 && row.passScore !== null ? `${row.stats.passRate}%` : '—'),
        },
        { key: 'status', label: 'Holat', cell: (row) => <StatusBadge kind="exam" status={row.status} /> },
      ]}
    />
  );
}

export function AttendanceSection({ scope }: { scope: AcademicScope }) {
  const statsQuery = useQuery({ queryKey: queryKeys.attendance.stats(scope), queryFn: () => attendanceService.stats(scope) });
  const sessionParams: SessionListParams = { ...scope, limit: LIMIT };
  const sessionsQuery = useQuery({
    queryKey: queryKeys.attendance.sessions(sessionParams),
    queryFn: () => attendanceSessionsService.list(sessionParams),
  });
  const month = statsQuery.data?.month;
  const week = statsQuery.data?.week;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          size="sm"
          title="Shu oy davomati"
          value={month?.total ? `${month.rate}%` : '—'}
          loading={statsQuery.isPending}
          {...(month?.total ? { valueTone: month.rate >= 85 ? ('success' as const) : month.rate >= 70 ? ('warning' as const) : ('danger' as const) } : {})}
          {...(month ? { description: `${formatNumber(month.total)} ta belgi` } : {})}
        />
        <StatCard
          size="sm"
          title="Shu hafta"
          value={week?.total ? `${week.rate}%` : '—'}
          loading={statsQuery.isPending}
          {...(week ? { description: `${formatNumber(week.total)} ta belgi` } : {})}
        />
        <StatCard
          size="sm"
          title="Kelmagan (oy)"
          value={month ? formatNumber(month.ABSENT) : '—'}
          loading={statsQuery.isPending}
          {...(month ? { description: `kechikkan ${formatNumber(month.LATE)}` } : {})}
        />
        <StatCard
          size="sm"
          title="O‘tilgan darslar"
          value={statsQuery.data ? formatNumber(statsQuery.data.sessions) : '—'}
          loading={statsQuery.isPending}
          description="tanlangan davrda"
        />
      </div>

      <DataTable
        label="So‘nggi darslar"
        header={
          <CardHeader className="items-center">
            <CardTitle>So‘nggi darslar</CardTitle>
            <ViewAll to={scope.groupId ? `/attendance?groupId=${scope.groupId}` : '/attendance'} />
          </CardHeader>
        }
        rows={sessionsQuery.data}
        rowKey={(row) => row.id}
        loading={sessionsQuery.isPending}
        error={sessionsQuery.error}
        retrying={sessionsQuery.isFetching}
        onRetry={() => void sessionsQuery.refetch()}
        empty={{ icon: CalendarCheck, title: 'Dars qayd etilmagan', description: 'Davomat belgilangach darslar shu yerda ko‘rinadi' }}
        mobileLayout="cards"
        columns={[
          { key: 'date', label: 'Sana', tdClassName: 'whitespace-nowrap font-medium text-fg', cell: (row) => formatDate(row.date) },
          {
            key: 'time',
            label: 'Vaqt',
            tdClassName: 'whitespace-nowrap text-fg-muted',
            cell: (row) => (row.startTime ? `${row.startTime}${row.endTime ? `–${row.endTime}` : ''}` : '—'),
          },
          ...(scope.groupId ? [] : [{ key: 'group', label: 'Guruh', tdClassName: 'text-fg-muted', cell: (row: { group: { name: string } }) => row.group.name }]),
          { key: 'topic', label: 'Mavzu', tdClassName: 'text-fg-muted', cell: (row) => row.topic ?? '—' },
          { key: 'marked', label: 'Belgilangan', align: 'right', tdClassName: 'text-fg-muted', cell: (row) => formatNumber(row.markedCount) },
        ]}
      />
    </div>
  );
}
