import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck, ClipboardCheck, FileCheck, GraduationCap, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';
import { teachingService } from '@/services/teaching.service';
import type { TeachingGroupCard } from '@/types/teaching';
import { formatSchedule } from '@/utils/courseLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd
        className={cn(
          'text-lg font-semibold tabular-nums',
          value === null ? 'text-fg-subtle' : value >= 80 ? 'text-emerald-600 dark:text-emerald-400' : value >= 60 ? 'text-fg' : 'text-red-600 dark:text-red-400',
        )}
      >
        {value === null ? '—' : `${value}%`}
      </dd>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-xs text-fg-muted">
        <Icon className="size-4" aria-hidden /> {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'warn' && value > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-fg')}>{value}</p>
    </div>
  );
}

function GroupCard({ group }: { group: TeachingGroupCard }) {
  const atRisk = group.risk.AT_RISK + group.risk.CRITICAL;
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/teaching/groups/${group.id}`} className="block truncate text-base font-semibold text-fg hover:underline">
              {group.name}
            </Link>
            <p className="text-xs text-fg-muted">
              {group.course.name} · {formatSchedule(group.schedule.days, group.schedule.startTime, group.schedule.endTime)}
            </p>
          </div>
          {group.today.isLessonDay &&
            (group.today.attendanceMarked ? <Badge tone="green">Bugun dars · belgilandi</Badge> : <Badge tone="yellow">Bugun dars · davomat yo‘q</Badge>)}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Davomat" value={group.attendanceRate} />
          <Metric label="Vazifa" value={group.homeworkRate} />
          <Metric label="Imtihon" value={group.examAverage} />
          <Metric label="Progress" value={group.progress} />
        </dl>
        <p className="text-sm text-fg-muted">
          {group.students} o‘quvchi
          {atRisk > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5" aria-hidden /> {atRisk} xavf ostida
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to={`/attendance?groupId=${group.id}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-fg hover:bg-surface-muted">
            <CalendarCheck className="size-4" aria-hidden /> Davomat
          </Link>
          <Link to="/homework" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-fg hover:bg-surface-muted">
            <ClipboardCheck className="size-4" aria-hidden /> Vazifalar{group.pending.homeworkToGrade > 0 && ` · ${group.pending.homeworkToGrade} baholash`}
          </Link>
          <Link to="/exams" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-fg hover:bg-surface-muted">
            <FileCheck className="size-4" aria-hidden /> Imtihonlar{group.pending.attemptsToReview > 0 && ` · ${group.pending.attemptsToReview} tekshirish`}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** O'qituvchi boshqaruv markazi (TZ §28): "Mening guruhlarim" — ko'rsatkichlar va kutilayotgan ishlar */
export default function TeachingPage() {
  const canPickTeacher = usePermission(PERMISSIONS.GROUP_MANAGE);
  const [teacherId, setTeacherId] = useState('');
  const query = useQuery({ queryKey: queryKeys.teaching.overview(teacherId), queryFn: () => teachingService.overview(teacherId || undefined) });
  const teachersQuery = useQuery({
    queryKey: queryKeys.teachers.list({ page: 1, limit: 100 }),
    queryFn: () => teachersService.list({ page: 1, limit: 100 }),
    enabled: canPickTeacher,
    staleTime: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="O‘qituvchi markazi"
        description="Guruhlaringiz holati, xavf ostidagi o‘quvchilar va bugungi ishlar"
        actions={
          canPickTeacher ? (
            <Select aria-label="O‘qituvchi" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
              <option value="">Barcha o‘qituvchilar</option>
              {(teachersQuery.data?.items ?? []).map((teacher) => (
                <option key={teacher.id} value={teacher.user.id}>
                  {teacher.user.firstName} {teacher.user.lastName}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile icon={Layers} label="Guruhlar" value={query.data.totals.groups} />
            <Tile icon={GraduationCap} label="O‘quvchilar" value={query.data.totals.students} />
            <Tile icon={AlertTriangle} label="Xavf ostida" value={query.data.totals.atRisk} tone="warn" />
            <Tile icon={ClipboardCheck} label="Baholash kutmoqda" value={query.data.totals.homeworkToGrade + query.data.totals.attemptsToReview} tone="warn" />
            <Tile icon={CalendarCheck} label="Bugun davomat yo‘q" value={query.data.totals.unmarkedToday} tone="warn" />
          </div>
          {query.data.groups.length === 0 ? (
            <Card>
              <EmptyState icon={Layers} title="Faol guruh yo‘q" description="Sizga biriktirilgan faol guruhlar shu yerda ko‘rinadi" />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {query.data.groups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
