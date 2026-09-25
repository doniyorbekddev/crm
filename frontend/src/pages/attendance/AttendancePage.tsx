import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarCheck, CheckCheck, LayoutDashboard, Layers, NotebookPen, Trophy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import { curriculumService } from '@/services/curriculum.service';
import { groupsService } from '@/services/groups.service';
import type { AttendanceStatus } from '@/types/attendance';
import { formatSchedule } from '@/utils/courseLabels';
import { formatDate, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import {
  ATTENDANCE_BUTTON_CLASSES,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_ORDER,
  ATTENDANCE_STATUS_TONES,
} from '@/utils/studentLabels';
import { AttendanceRanking } from './AttendanceRanking';
import { AttendanceStats } from './AttendanceStats';
import { TeacherOverview } from './TeacherOverview';
import { useSearchParams } from 'react-router-dom';

const GROUP_PAGE_SIZE = 100;

type Tab = 'journal' | 'overview' | 'stats' | 'ranking';

const TABS: ReadonlyArray<{ value: Tab; label: string; icon: typeof CalendarCheck }> = [
  { value: 'journal', label: 'Jurnal', icon: NotebookPen },
  { value: 'overview', label: 'Mening darslarim', icon: LayoutDashboard },
  { value: 'stats', label: 'Statistika', icon: BarChart3 },
  { value: 'ranking', label: 'Reyting', icon: Trophy },
];

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const canMark = usePermission(PERMISSIONS.ATTENDANCE_MARK);

  const [tab, setTab] = useState<Tab>('journal');
  // O'qituvchi markazidan "Davomat" bosilsa guruh oldindan tanlangan keladi
  const [searchParams] = useSearchParams();
  const [selectedGroupId, setSelectedGroupId] = useState(() => searchParams.get('groupId') ?? '');
  const [date, setDate] = useState(todayValue);
  /** Saqlanmagan o‘zgarishlar: studentId → holat */
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  /** Shu darsda o‘tilgan kurs mavzusi (LMS) — kelganlar progressi yangilanadi */
  const [topicId, setTopicId] = useState('');

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list({ page: 1, limit: GROUP_PAGE_SIZE, status: 'ACTIVE' }),
    queryFn: () => groupsService.list({ page: 1, limit: GROUP_PAGE_SIZE, status: 'ACTIVE' }),
  });

  const groups = groupsQuery.data?.items ?? [];
  // Tanlanmagan bo‘lsa birinchi guruh ochiladi — o‘qituvchida odatda bir-ikkita guruh bo‘ladi
  const groupId = selectedGroupId || groups[0]?.id || '';

  const sheetQuery = useQuery({
    queryKey: queryKeys.attendance.sheet(groupId, date),
    queryFn: () => attendanceService.sheet(groupId, date),
    enabled: Boolean(groupId && date),
  });

  const sheet = sheetQuery.data;
  const courseId = groups.find((group) => group.id === groupId)?.course.id ?? '';
  const curriculumQuery = useQuery({
    queryKey: queryKeys.curriculum.course(courseId),
    queryFn: () => curriculumService.forCourse(courseId),
    enabled: Boolean(courseId) && canMark,
    staleTime: 60_000,
  });
  const topics = (curriculumQuery.data?.modules ?? []).flatMap((module) => module.topics.filter((topic) => topic.isActive).map((topic) => ({ ...topic, moduleTitle: module.title })));

  const save = useMutation({
    mutationFn: () =>
      attendanceService.mark(groupId, {
        date,
        ...(topicId ? { topicId } : {}),
        // Mavzu tanlansa, faqat o'zgarganlar emas — barcha belgilangan o'quvchilar yuboriladi (progress uchun)
        records: topicId && sheet
          ? sheet.students
              .map((row) => ({ studentId: row.studentId, status: draft[row.studentId] ?? row.status }))
              .filter((row): row is { studentId: string; status: AttendanceStatus } => row.status !== null)
          : Object.entries(draft).map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setDraft({});
      setTopicId('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all });
      queryClient.setQueryData(queryKeys.attendance.sheet(groupId, date), result.data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changeSelection = (apply: () => void) => {
    apply();
    setDraft({});
    setTopicId('');
  };

  const markAllPresent = () => {
    if (!sheet) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const row of sheet.students) {
      if ((draft[row.studentId] ?? row.status) !== 'PRESENT') next[row.studentId] = 'PRESENT';
    }
    setDraft((current) => ({ ...current, ...next }));
  };

  const pendingCount = Object.keys(draft).length;

  return (
    <>
      <PageHeader title="Davomat" description="Jurnal, statistika va o‘quvchilar reytingi" />

      <div role="tablist" aria-label="Davomat bo‘limlari" className="mb-4 -mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((item) => {
          const active = tab === item.value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'stats' && <AttendanceStats />}
      {tab === 'ranking' && <AttendanceRanking />}
      {tab === 'overview' && (
        <TeacherOverview
          onSelectGroup={(groupId) => {
            changeSelection(() => setSelectedGroupId(groupId));
            setTab('journal');
          }}
        />
      )}

      <Card className={cn(tab === 'journal' ? '' : 'hidden')}>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <Select
            value={groupId}
            onChange={(event) => changeSelection(() => setSelectedGroupId(event.target.value))}
            aria-label="Guruh"
            wrapperClassName="sm:w-72"
            disabled={groupsQuery.isPending || groups.length === 0}
          >
            {groups.length === 0 && <option value="">Guruh yo‘q</option>}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} — {group.course.name}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(event) => changeSelection(() => setDate(event.target.value))}
            aria-label="Sana"
            className="sm:w-48"
          />
          <div className="sm:ml-auto sm:flex sm:gap-2">
            {canMark && sheet && sheet.students.length > 0 && (
              <Button variant="secondary" leftIcon={<CheckCheck className="size-4" aria-hidden />} onClick={markAllPresent}>
                Hammasi keldi
              </Button>
            )}
            {canMark && topics.length > 0 && (
              <Select value={topicId} onChange={(event) => setTopicId(event.target.value)} aria-label="O‘tilgan mavzu" wrapperClassName="sm:w-56">
                <option value="">O‘tilgan mavzu (ixtiyoriy)</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.moduleTitle} · {topic.title}
                  </option>
                ))}
              </Select>
            )}
            {canMark && (
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={pendingCount === 0 && !topicId}>
                Saqlash{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </Button>
            )}
          </div>
        </div>

        {groupsQuery.isError ? (
          <ErrorState error={groupsQuery.error} retrying={groupsQuery.isFetching} onRetry={() => void groupsQuery.refetch()} />
        ) : groupsQuery.isPending ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon={Layers} title="Faol guruh yo‘q" description="Davomat belgilash uchun avval faol guruh kerak" />
        ) : sheetQuery.isPending ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : sheetQuery.isError ? (
          <ErrorState error={sheetQuery.error} retrying={sheetQuery.isFetching} onRetry={() => void sheetQuery.refetch()} />
        ) : !sheet ? null : (
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <span className="font-medium text-fg">{formatDate(sheet.date)}</span>
              <span>·</span>
              <span>{formatSchedule(sheet.group.scheduleDays, sheet.group.startTime, sheet.group.endTime)}</span>
              {sheet.group.room && <span>· {sheet.group.room}-xona</span>}
              {sheet.group.teacher && (
                <span>
                  · {sheet.group.teacher.firstName} {sheet.group.teacher.lastName}
                </span>
              )}
            </div>

            {!sheet.isScheduledDay && (
              <Alert tone="warning">Bu kun guruh jadvalida yo‘q. Kerak bo‘lsa baribir belgilashingiz mumkin.</Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {ATTENDANCE_STATUS_ORDER.map((status) => (
                <Badge key={status} tone={ATTENDANCE_STATUS_TONES[status]}>
                  {ATTENDANCE_STATUS_LABELS[status]}: {sheet.summary[status]}
                </Badge>
              ))}
              <Badge>Belgilanmagan: {sheet.summary.unmarked}</Badge>
            </div>

            {sheet.students.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Guruhda faol o‘quvchi yo‘q" description="O‘quvchi qo‘shilgach jurnal to‘ladi" />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {sheet.students.map((row) => {
                  const current = draft[row.studentId] ?? row.status;
                  const changed = Boolean(draft[row.studentId]) && draft[row.studentId] !== row.status;
                  return (
                    <li key={row.studentId} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">
                          {row.firstName} {row.lastName}
                          {changed && <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">saqlanmagan</span>}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {row.code} · {formatPhone(row.phone)}
                          {row.markedBy && ` · ${row.markedBy.firstName} belgilagan`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ATTENDANCE_STATUS_ORDER.map((status) => {
                          const active = current === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              disabled={!canMark || save.isPending}
                              aria-pressed={active}
                              onClick={() => setDraft((prev) => ({ ...prev, [row.studentId]: status }))}
                              className={cn(
                                'h-8 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                active
                                  ? ATTENDANCE_BUTTON_CLASSES[status]
                                  : 'border-border text-fg-muted hover:bg-surface-muted hover:text-fg',
                              )}
                            >
                              {ATTENDANCE_STATUS_LABELS[status]}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
