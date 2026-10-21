import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, CheckCheck, CheckCircle2, NotebookTabs } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, Navigate, useBlocker, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
import { formatDate, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { ATTENDANCE_BUTTON_CLASSES, ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Bitta guruhning bir kunlik davomati. O'quvchi qatoridagi tugmalar bilan belgilanadi; o'zgarishlar "Saqlash"
 * bosilguncha qoralamada turadi (dars paytida bitta so'rov — tez va tarmoq uzilsa hech narsa yarim saqlanmaydi).
 *
 * Belgilanmagan o'quvchi belgilanmagan bo'lib qoladi — jimgina "kelmadi" qilinmaydi.
 */
export default function GroupAttendancePage() {
  const { groupId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const hasMarkPermission = usePermission(PERMISSIONS.ATTENDANCE_MARK);

  const dateParam = searchParams.get('date') ?? '';
  const date = DATE_PATTERN.test(dateParam) ? dateParam : '';

  // Sana berilmagan (yoki noto'g'ri) bo'lsa — bugungi sana serverdan olinadi: brauzer soati/vaqt zonasiga ishonilmaydi
  const todayQuery = useQuery({ queryKey: queryKeys.attendance.day('today'), queryFn: () => attendanceService.day(), enabled: !date, staleTime: 60_000 });

  /** Saqlanmagan o'zgarishlar: studentId → holat */
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [topicId, setTopicId] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const sheetQuery = useQuery({
    queryKey: queryKeys.attendance.sheet(groupId, date),
    queryFn: () => attendanceService.sheet(groupId, date),
    enabled: Boolean(groupId && date),
  });
  const sheet = sheetQuery.data;
  const canMark = hasMarkPermission && (sheet?.canMark ?? false);

  // Kurs mavzulari (ixtiyoriy) — guruh kartasidan kurs aniqlanadi
  const groupQuery = useQuery({ queryKey: queryKeys.groups.detail(groupId), queryFn: () => groupsService.getById(groupId), enabled: Boolean(groupId) && hasMarkPermission, staleTime: 60_000 });
  const courseId = groupQuery.data?.course.id ?? '';
  const curriculumQuery = useQuery({ queryKey: queryKeys.curriculum.course(courseId), queryFn: () => curriculumService.forCourse(courseId), enabled: Boolean(courseId) && canMark, staleTime: 60_000 });
  const topics = (curriculumQuery.data?.modules ?? []).flatMap((module) => module.topics.filter((topic) => topic.isActive).map((topic) => ({ ...topic, moduleTitle: module.title })));

  // Faqat haqiqatan farq qiladigan qoralamalar — "keldi → kelmadi → keldi" o'zgarish emas
  const pending = sheet ? Object.entries(draft).filter(([studentId, status]) => sheet.students.find((row) => row.studentId === studentId)?.status !== status) : [];
  const pendingCount = pending.length;
  const dirty = pendingCount > 0;

  const save = useMutation({
    mutationFn: () =>
      attendanceService.mark(groupId, {
        date,
        ...(topicId ? { topicId } : {}),
        // Mavzu tanlansa, faqat o'zgarganlar emas — barcha belgilangan o'quvchilar yuboriladi (progress uchun)
        records:
          topicId && sheet
            ? sheet.students
                .map((row) => ({ studentId: row.studentId, status: draft[row.studentId] ?? row.status }))
                .filter((row): row is { studentId: string; status: AttendanceStatus } => row.status !== null)
            : pending.map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setDraft({});
      setTopicId('');
      setSavedAt(new Date());
      queryClient.setQueryData(queryKeys.attendance.sheet(groupId, date), result.data);
      // Taxtadagi karta holati, o'qituvchi paneli va o'quvchi sahifalari yangilanadi (ochiq jurnalning o'zi emas)
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'day'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'day-records'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.teacherOverview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
    // Xato bo'lsa qoralama saqlanib qoladi — o'qituvchi qayta urinadi, belgilar yo'qolmaydi
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const submit = () => {
    // Ikki marta bosish ikkinchi so'rov yubormaydi
    if (save.isPending || (!dirty && !topicId)) return;
    save.mutate();
  };

  // Saqlanmagan o'zgarish bilan sahifadan chiqish: ilova ichida — tasdiq oynasi, brauzer yopilishi/yangilanishi — brauzer ogohlantirishi
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setSavedAt(null);
    setDraft((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAllPresent = () => {
    if (!sheet) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const row of sheet.students) next[row.studentId] = 'PRESENT';
    setSavedAt(null);
    setDraft(next);
  };

  /**
   * Klaviatura: 1–4 — holat (tartib tugmalardagidek) va keyingi o'quvchi, ←/→ — holatlar orasida, ↑/↓ — o'quvchilar orasida.
   */
  const handleRowKey = (event: KeyboardEvent<HTMLDivElement>, studentId: string) => {
    const picked = ATTENDANCE_STATUS_ORDER[Number(event.key) - 1];
    const group = event.currentTarget;
    const focusIn = (target: Element | null | undefined, status?: string) => {
      const buttons = target ? [...target.querySelectorAll<HTMLButtonElement>('button[data-status]')] : [];
      (buttons.find((button) => button.dataset.status === status) ?? buttons[0])?.focus();
    };
    const currentStatus = (document.activeElement as HTMLElement | null)?.dataset.status;
    const rows = [...document.querySelectorAll('[data-attendance-row]')];
    const position = rows.indexOf(group);

    if (picked && canMark && !save.isPending) {
      event.preventDefault();
      setStatus(studentId, picked);
      focusIn(rows[position + 1] ?? group, picked);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusIn(rows[position + (event.key === 'ArrowDown' ? 1 : -1)], currentStatus);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[data-status]')];
      const next = buttons[buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  };

  if (!date) {
    if (todayQuery.data) return <Navigate to={`/attendance/groups/${groupId}?date=${todayQuery.data.today}`} replace />;
    if (todayQuery.isError) return <ErrorState error={todayQuery.error} onRetry={() => void todayQuery.refetch()} />;
    return <Skeleton className="h-40 w-full" />;
  }

  const back = (
    <Link to={date ? `/attendance?day=${date}` : '/attendance'} className="focus-ring inline-flex items-center gap-1 rounded-sm text-body text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden />
      Davomat
    </Link>
  );

  if (sheetQuery.isPending) {
    return (
      <>
        <PageHeader title="Guruh davomati" breadcrumb={back} />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </>
    );
  }
  if (sheetQuery.isError || !sheet) {
    return (
      <>
        <PageHeader title="Guruh davomati" breadcrumb={back} />
        <Card>
          <ErrorState error={sheetQuery.error} retrying={sheetQuery.isFetching} onRetry={() => void sheetQuery.refetch()} />
        </Card>
      </>
    );
  }

  const statusOf = (studentId: string, saved: AttendanceStatus | null) => draft[studentId] ?? saved;
  const total = sheet.students.length;
  const markedNow = sheet.students.filter((row) => statusOf(row.studentId, row.status) !== null).length;
  const counts = ATTENDANCE_STATUS_ORDER.map((status) => ({ status, count: sheet.students.filter((row) => statusOf(row.studentId, row.status) === status).length }));
  const startTime = sheet.session?.startTime ?? sheet.group.startTime;
  const endTime = sheet.session?.endTime ?? sheet.group.endTime;
  const isToday = sheet.today ? sheet.date === sheet.today : true;
  const former = sheet.formerStudents ?? [];

  return (
    <>
      <PageHeader
        title={sheet.group.name}
        documentTitle={`${sheet.group.name} — davomat`}
        description={`${sheet.group.courseName} · ${formatDate(sheet.date)} · ${startTime}–${endTime}${sheet.group.room ? ` · ${sheet.group.room}-xona` : ''}`}
        breadcrumb={back}
        actions={
          <>
            <Link
              to={`/attendance/groups/${groupId}/journal?month=${date.slice(0, 7)}`}
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-control border border-border px-3 text-body font-medium text-fg hover:bg-surface-muted"
            >
              <NotebookTabs className="size-4" aria-hidden />
              Oylik jurnal
            </Link>
            <Input
              type="date"
              aria-label="Dars sanasi"
              className="sm:w-44"
              value={date}
              disabled={dirty || save.isPending}
              title={dirty ? 'Avval o‘zgarishlarni saqlang' : undefined}
              onChange={(event) => {
                if (DATE_PATTERN.test(event.target.value)) {
                  setSavedAt(null);
                  setSearchParams({ date: event.target.value }, { replace: true });
                }
              }}
            />
          </>
        }
      />

      <div className="mb-3 space-y-2">
        {!isToday && sheet.today && <Alert tone="info">Siz bugungi emas, {formatDate(sheet.date)} sanasidagi darsni belgilayapsiz.</Alert>}
        {sheet.sessionStatus === 'CANCELLED' && <Alert tone="warning">Bu dars bekor qilingan deb belgilangan.</Alert>}
        {!sheet.isScheduledDay && <Alert tone="warning">Bu kun guruh jadvalida yo‘q. Qo‘shimcha dars bo‘lsa, baribir belgilashingiz mumkin.</Alert>}
        {save.isError && (
          <Alert tone="error" title="Davomat saqlanmadi">
            {getErrorMessage(save.error)} Belgilaringiz yo‘qolmadi — qayta urinib ko‘ring.
          </Alert>
        )}
      </div>

      <Card>
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body text-fg" aria-live="polite">
              <span className="font-semibold tabular-nums">
                {markedNow} / {total}
              </span>{' '}
              o‘quvchi belgilangan
            </p>
            <div className="flex flex-wrap gap-1.5">
              {counts.map(({ status, count }) => (
                <Badge key={status} tone={ATTENDANCE_STATUS_TONES[status]}>
                  {ATTENDANCE_STATUS_LABELS[status]}: {count}
                </Badge>
              ))}
              <Badge>Belgilanmagan: {total - markedNow}</Badge>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Davomat to‘ldirilishi" aria-valuemin={0} aria-valuemax={total} aria-valuenow={markedNow}>
            <div className={cn('h-full rounded-full transition-[width]', total > 0 && markedNow === total ? 'bg-success-solid' : 'bg-primary')} style={{ width: `${total === 0 ? 0 : Math.round((markedNow / total) * 100)}%` }} />
          </div>
          {canMark && total > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="secondary" leftIcon={<CheckCheck className="size-4" aria-hidden />} onClick={markAllPresent} disabled={save.isPending}>
                Hammasi keldi
              </Button>
              {topics.length > 0 && (
                <Select value={topicId} onChange={(event) => setTopicId(event.target.value)} aria-label="O‘tilgan mavzu" wrapperClassName="sm:w-64" disabled={save.isPending}>
                  <option value="">O‘tilgan mavzu (ixtiyoriy)</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.moduleTitle} · {topic.title}
                    </option>
                  ))}
                </Select>
              )}
              <p id="attendance-keys" className="hidden text-caption text-fg-subtle lg:ml-auto lg:block">
                Klaviatura: <kbd className="font-mono">1</kbd>–<kbd className="font-mono">4</kbd> — holat va keyingi o‘quvchi, <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> — o‘quvchilar orasida
              </p>
            </div>
          )}
        </div>

        {total === 0 ? (
          <EmptyState icon={CalendarCheck} title="Guruhda faol o‘quvchi yo‘q" description="O‘quvchi guruhga qo‘shilgach shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border" {...(canMark ? { 'aria-describedby': 'attendance-keys' } : {})}>
            {sheet.students.map((row) => {
              const current = statusOf(row.studentId, row.status);
              const changed = draft[row.studentId] !== undefined && draft[row.studentId] !== row.status;
              return (
                <li key={row.studentId} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">
                      {row.firstName} {row.lastName}
                      {changed && <span className="ml-2 text-caption font-normal text-warning">saqlanmagan</span>}
                    </p>
                    <p className="text-caption text-fg-muted">
                      {row.code} · {formatPhone(row.phone)}
                      {row.markedBy && ` · ${row.markedBy.firstName} belgilagan`}
                    </p>
                  </div>
                  <div role="group" aria-label={`${row.firstName} ${row.lastName} davomati`} data-attendance-row className="grid grid-cols-4 gap-1.5 sm:flex" onKeyDown={(event) => handleRowKey(event, row.studentId)}>
                    {ATTENDANCE_STATUS_ORDER.map((status) => {
                      const active = current === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={!canMark || save.isPending}
                          aria-pressed={active}
                          data-status={status}
                          onClick={() => setStatus(row.studentId, status)}
                          className={cn(
                            'focus-ring h-10 rounded-control border px-2 text-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:px-3',
                            active ? ATTENDANCE_BUTTON_CLASSES[status] : 'border-border text-fg-muted hover:bg-surface-muted hover:text-fg',
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

        {canMark && total > 0 && (
          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-card border-t border-border bg-surface px-3 py-2.5">
            <p className="min-w-0 text-body text-fg-muted" role="status">
              {save.isPending ? (
                'Saqlanmoqda…'
              ) : dirty ? (
                <span className="text-warning">{pendingCount} ta saqlanmagan o‘zgarish</span>
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-4" aria-hidden />
                  Saqlandi
                </span>
              ) : (
                'O‘zgarish yo‘q'
              )}
            </p>
            <Button onClick={submit} loading={save.isPending} disabled={!dirty && !topicId}>
              Saqlash{dirty ? ` (${pendingCount})` : ''}
            </Button>
          </div>
        )}
      </Card>

      {former.length > 0 && (
        <Card className="mt-4">
          <section aria-label="Guruhdan chiqqan o‘quvchilar" className="p-3">
            <h2 className="text-label font-semibold text-fg">Shu kuni belgilangan, hozir guruhda yo‘q</h2>
            <p className="mb-2 text-caption text-fg-muted">Tarix saqlanadi; bu yozuvlarni o‘zgartirib bo‘lmaydi.</p>
            <ul className="divide-y divide-border">
              {former.map((row) => (
                <li key={row.studentId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-body text-fg">
                    {row.firstName} {row.lastName} <span className="text-fg-muted">· {row.code}</span>
                  </span>
                  {row.status && <Badge tone={ATTENDANCE_STATUS_TONES[row.status]}>{ATTENDANCE_STATUS_LABELS[row.status]}</Badge>}
                </li>
              ))}
            </ul>
          </section>
        </Card>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Saqlanmagan o‘zgarishlar bor"
        description={`${pendingCount} ta o‘quvchining davomati saqlanmagan. Chiqsangiz, bu belgilar yo‘qoladi.`}
        confirmLabel="Saqlamasdan chiqish"
        cancelLabel="Qolish"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </>
  );
}
