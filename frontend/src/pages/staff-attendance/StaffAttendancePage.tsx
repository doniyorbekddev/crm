import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarClock, ClipboardList, Coffee, FileBarChart, LogOut, MonitorSmartphone, Plus, ShieldAlert, Timer, Trash2, UserCheck, Users, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ExportMenu } from '@/components/ExportMenu';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { Table, TableContainer, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import type { ExportFormat } from '@/lib/download';
import { queryKeys } from '@/lib/queryKeys';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { PermissionRequest, RequestStatus, ScheduleRow, StaffDayStatus } from '@/types/staffAttendance';
import { PERMISSIONS } from '@/utils/permissionKeys';
import {
  displayDate,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONES,
  REQUEST_TYPE_LABELS,
  shiftDate,
  shortDuration,
  STAFF_STATUS_LABELS,
  tashkentDate,
  tashkentTime,
  WEEK_DAY_SHORT,
} from '@/utils/staffAttendanceLabels';
import { DayDetailDrawer } from './DayDetailDrawer';
import { PermissionRequestModal } from './PermissionRequestModal';
import { ScheduleModal } from './ScheduleModal';
import { planText, StaffStatusBadge } from './StaffStatus';

type TabKey = 'today' | 'report' | 'requests' | 'schedules';
const TABS: ReadonlyArray<{ value: TabKey; label: string; icon: typeof Users }> = [
  { value: 'today', label: 'Bugun', icon: CalendarCheck2 },
  { value: 'report', label: 'Hisobot', icon: FileBarChart },
  { value: 'requests', label: 'Ruxsat so‘rovlari', icon: ClipboardList },
  { value: 'schedules', label: 'Ish jadvallari', icon: CalendarClock },
];

// ------------------------------------------------------------------ Bugun
function TodayTab({ onOpen }: { onOpen: (userId: string, date: string) => void }) {
  const today = tashkentDate();
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | StaffDayStatus>('');
  const query = useQuery({ queryKey: queryKeys.staffAttendance.overview(date), queryFn: () => staffAttendanceService.overview(date), refetchInterval: date === today ? 60_000 : false });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.rows ?? [])
      .filter((row) => (!needle || `${row.name} ${row.position}`.toLowerCase().includes(needle)) && (!status || row.status === status))
      .sort((a, b) => Number(b.expected) - Number(a.expected) || (a.scheduledStart ?? '99').localeCompare(b.scheduledStart ?? '99') || a.name.localeCompare(b.name));
  }, [query.data, search, status]);
  const counts = query.data?.counts;
  const loading = query.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Sana" htmlFor="overview-date">
          <Input id="overview-date" type="date" max={today} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </FormField>
        {date !== today && (
          <Button variant="secondary" onClick={() => setDate(today)}>
            Bugun
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard size="sm" title="Kutilmoqda" value={counts?.expected ?? 0} icon={Users} loading={loading} />
        <StatCard size="sm" title="Hozir ishda" value={counts?.working ?? 0} description={counts ? `tanaffusda: ${counts.onBreak}` : undefined} icon={UserCheck} tone="success" loading={loading} />
        <StatCard size="sm" title="O‘z vaqtida" value={counts?.onTime ?? 0} icon={CalendarCheck2} tone="primary" loading={loading} />
        <StatCard size="sm" title="Kechikkan" value={counts?.late ?? 0} icon={Timer} tone="warning" loading={loading} />
        <StatCard size="sm" title="Hali kelmagan" value={counts?.notArrived ?? 0} description={counts ? `kelmagan: ${counts.absent}, sababli: ${counts.excused}` : undefined} icon={UserX} tone="danger" loading={loading} />
        <StatCard size="sm" title="Tanaffusda" value={counts?.onBreak ?? 0} icon={Coffee} tone="info" loading={loading} />
        <StatCard size="sm" title="Ketgan" value={counts?.checkedOut ?? 0} icon={LogOut} loading={loading} />
        <StatCard size="sm" title="Tekshiruv kerak" value={counts?.review ?? 0} icon={ShieldAlert} tone={counts?.review ? 'danger' : 'neutral'} loading={loading} />
      </div>

      {query.data && query.data.reviewQueue.length > 0 && (
        <Alert tone="warning" title="Ketishi belgilanmagan kunlar — tuzatish kerak">
          <ul className="mt-1 flex flex-wrap gap-2">
            {query.data.reviewQueue.map((item) => (
              <li key={`${item.userId}:${item.date}`}>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen(item.userId, item.date)}>
                  {item.name} — {displayDate(item.date)} ({tashkentTime(item.checkInAt)})
                </button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Xodim yoki lavozim" className="sm:max-w-xs" />
          <Select aria-label="Holat" value={status} onChange={(event) => setStatus(event.target.value as '' | StaffDayStatus)} wrapperClassName="sm:w-52">
            <option value="">Barcha holatlar</option>
            {(Object.keys(STAFF_STATUS_LABELS) as StaffDayStatus[]).map((key) => (
              <option key={key} value={key}>
                {STAFF_STATUS_LABELS[key]}
              </option>
            ))}
          </Select>
        </div>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : loading ? (
          <TableSkeleton columns={8} />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Xodim</TH>
                  <TH>Lavozim</TH>
                  <TH>Jadval</TH>
                  <TH>Keldi</TH>
                  <TH>Ketdi</TH>
                  <TH>Tanaffus</TH>
                  <TH>Ish vaqti</TH>
                  <TH>Holat</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.userId} className="cursor-pointer hover:bg-surface-muted" onClick={() => onOpen(row.userId, date)}>
                    <TD className="font-medium">
                      <button type="button" className="text-left hover:underline" onClick={() => onOpen(row.userId, date)}>
                        {row.name}
                      </button>
                    </TD>
                    <TD className="text-fg-muted">{row.position}</TD>
                    <TD className="whitespace-nowrap text-fg-muted">{planText(row)}</TD>
                    <TD className="tabular-nums">{tashkentTime(row.checkInAt)}</TD>
                    <TD className="tabular-nums">{tashkentTime(row.checkOutAt)}</TD>
                    <TD className="tabular-nums">{row.breakSeconds ? shortDuration(row.breakSeconds) : '—'}</TD>
                    <TD className="tabular-nums">{shortDuration(row.workedSeconds)}</TD>
                    <TD>
                      <StaffStatusBadge day={row} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-body text-fg-subtle">
                {query.data?.rows.length ? 'Filtrga mos xodim yo‘q' : 'Davomati yuritiladigan xodim yo‘q. O‘qituvchi yoki xodim hisobiga bog‘langan bo‘lishi kerak.'}
              </p>
            )}
          </TableContainer>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Hisobot
function ReportTab() {
  const today = tashkentDate();
  const monthStart = `${today.slice(0, 8)}01`;
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const presets = [
    { label: 'Bugun', from: today, to: today },
    { label: 'Bu hafta', from: shiftDate(today, -weekday), to: today },
    { label: 'Bu oy', from: monthStart, to: today },
    { label: 'O‘tgan oy', from: `${shiftDate(monthStart, -1).slice(0, 8)}01`, to: shiftDate(monthStart, -1) },
  ];
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [exporting, setExporting] = useState(false);
  const query = useQuery({ queryKey: queryKeys.staffAttendance.report(range.from, range.to), queryFn: () => staffAttendanceService.report(range.from, range.to), enabled: range.from <= range.to });

  async function exportReport(format: ExportFormat) {
    setExporting(true);
    try {
      await staffAttendanceService.exportReport(range.from, range.to, format);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  const total = query.data?.total;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant={preset.from === range.from && preset.to === range.to ? 'primary' : 'secondary'}
            onClick={() => setRange({ from: preset.from, to: preset.to })}
          >
            {preset.label}
          </Button>
        ))}
        <FormField label="Dan" htmlFor="report-from">
          <Input id="report-from" type="date" max={range.to} value={range.from} onChange={(event) => event.target.value && setRange((value) => ({ ...value, from: event.target.value }))} />
        </FormField>
        <FormField label="Gacha" htmlFor="report-to">
          <Input id="report-to" type="date" min={range.from} value={range.to} onChange={(event) => event.target.value && setRange((value) => ({ ...value, to: event.target.value }))} />
        </FormField>
        <div className="ml-auto">
          <ExportMenu onExport={(format) => void exportReport(format)} loading={exporting} disabled={!query.data} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard size="sm" title="Davomat" value={total?.attendancePercent !== null && total ? `${total.attendancePercent}%` : '—'} icon={UserCheck} tone="primary" loading={query.isPending} />
        <StatCard size="sm" title="Kechikishlar" value={total ? `${total.lateDays} marta` : '—'} description={total ? `${total.lateMinutes} daqiqa` : undefined} icon={Timer} tone="warning" loading={query.isPending} />
        <StatCard size="sm" title="Kelmagan kunlar" value={total?.absentDays ?? 0} description={total ? `sababli: ${total.excusedDays}` : undefined} icon={UserX} tone="danger" loading={query.isPending} />
        <StatCard size="sm" title="Ishlagan vaqt" value={total ? shortDuration(total.workedSeconds) : '—'} description={total ? `rejada: ${shortDuration(total.scheduledSeconds)}` : undefined} icon={CalendarCheck2} tone="success" loading={query.isPending} />
      </div>

      <Card>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <TableSkeleton columns={9} />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Xodim</TH>
                  <TH>Ish kunlari</TH>
                  <TH>Kelgan</TH>
                  <TH>Kechikish</TH>
                  <TH>Erta ketish</TH>
                  <TH>Kelmagan / sababli</TH>
                  <TH>Tekshiruv</TH>
                  <TH>Ish vaqti (reja)</TH>
                  <TH>Davomat</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.rows.map((row) => (
                  <TR key={row.userId}>
                    <TD>
                      <p className="font-medium text-fg">{row.name}</p>
                      <p className="text-caption text-fg-subtle">{row.position}</p>
                    </TD>
                    <TD className="tabular-nums">{row.summary.expectedDays}</TD>
                    <TD className="tabular-nums">{row.summary.attendedDays}</TD>
                    <TD className="tabular-nums">{row.summary.lateDays ? `${row.summary.lateDays} · ${row.summary.lateMinutes} daq` : '—'}</TD>
                    <TD className="tabular-nums">{row.summary.earlyMinutes ? `${row.summary.earlyMinutes} daq` : '—'}</TD>
                    <TD className="tabular-nums">
                      {row.summary.absentDays} / {row.summary.excusedDays}
                    </TD>
                    <TD>{row.summary.reviewDays ? <Badge tone="danger">{row.summary.reviewDays}</Badge> : '—'}</TD>
                    <TD className="whitespace-nowrap tabular-nums">
                      {shortDuration(row.summary.workedSeconds)} <span className="text-fg-subtle">({shortDuration(row.summary.scheduledSeconds)})</span>
                    </TD>
                    <TD className="tabular-nums">{row.summary.attendancePercent === null ? '—' : `${row.summary.attendancePercent}%`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>
      <p className="text-caption text-fg-subtle">
        Ish vaqti faqat ketishi belgilangan kunlar bo‘yicha, tanaffussiz. Ketishi belgilanmagan kun “Tekshiruv”da sanaladi va tuzatilmaguncha vaqtga qo‘shilmaydi. Davomat
        ma’lumot uchun — maoshga avtomatik ta’sir qilmaydi.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ So'rovlar
function RequestsTab({ canManage, people }: { canManage: boolean; people: ScheduleRow[] }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RequestStatus | ''>('PENDING');
  const [rejecting, setRejecting] = useState<PermissionRequest | null>(null);
  const [note, setNote] = useState('');
  const [grantUser, setGrantUser] = useState('');
  const [granting, setGranting] = useState(false);
  const query = useQuery({ queryKey: queryKeys.staffAttendance.requests(status), queryFn: () => staffAttendanceService.requests(status || undefined) });
  const decide = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'APPROVED' | 'REJECTED'; comment?: string }) => staffAttendanceService.decideRequest(id, decision, comment),
    onSuccess: (response) => {
      toast.success(response.message);
      setRejecting(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const grantName = people.find((person) => person.userId === grantUser)?.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Tabs value={status || 'ALL'} onValueChange={(value) => setStatus(value === 'ALL' ? '' : (value as RequestStatus))} variant="pill" panels={false}>
          <TabList label="So‘rov holati">
            <Tab value="PENDING">Ko‘rib chiqilmagan</Tab>
            <Tab value="APPROVED">Tasdiqlangan</Tab>
            <Tab value="REJECTED">Rad etilgan</Tab>
            <Tab value="ALL">Hammasi</Tab>
          </TabList>
        </Tabs>
        {canManage && (
          <div className="flex items-end gap-2">
            <Select aria-label="Xodim" value={grantUser} onChange={(event) => setGrantUser(event.target.value)} wrapperClassName="w-56">
              <option value="">Xodimni tanlang</option>
              {people.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" leftIcon={<Plus className="size-4" aria-hidden />} disabled={!grantUser} onClick={() => setGranting(true)}>
              Ruxsat berish
            </Button>
          </div>
        )}
      </div>
      <Card>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (query.data ?? []).length === 0 ? (
          <p className="p-6 text-center text-body text-fg-subtle">{query.isPending ? 'Yuklanmoqda…' : 'So‘rovlar yo‘q'}</p>
        ) : (
          <ul className="divide-y divide-border">
            {query.data!.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-body font-medium text-fg">
                    {request.userName} — {REQUEST_TYPE_LABELS[request.type]}
                  </p>
                  <p className="text-caption text-fg-muted">
                    {displayDate(request.startDate)}
                    {request.endDate !== request.startDate && ` — ${displayDate(request.endDate)}`}
                    {request.time && (request.type === 'LATE_ARRIVAL' ? `, ${request.time} gacha` : `, ${request.time} dan`)} · {request.reason}
                  </p>
                  {request.decidedBy && (
                    <p className="text-caption text-fg-subtle">
                      {request.decidedBy}
                      {request.decisionNote ? `: ${request.decisionNote}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={REQUEST_STATUS_TONES[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
                  {canManage && request.status === 'PENDING' && (
                    <>
                      <Button size="sm" loading={decide.isPending && decide.variables?.id === request.id && decide.variables.decision === 'APPROVED'} onClick={() => decide.mutate({ id: request.id, decision: 'APPROVED' })}>
                        Tasdiqlash
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRejecting(request)}>
                        Rad etish
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {rejecting && (
        <Modal
          open
          onClose={() => setRejecting(null)}
          title="So‘rovni rad etish"
          description={`${rejecting.userName} — ${REQUEST_TYPE_LABELS[rejecting.type]}`}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Bekor qilish
              </Button>
              <Button variant="danger" loading={decide.isPending} onClick={() => decide.mutate({ id: rejecting.id, decision: 'REJECTED', ...(note.trim() ? { comment: note.trim() } : {}) })}>
                Rad etish
              </Button>
            </>
          }
        >
          <FormField label="Izoh (xodimga yuboriladi)" htmlFor="reject-note">
            <Textarea id="reject-note" rows={3} maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </Modal>
      )}
      {granting && grantUser && (
        <PermissionRequestModal
          title={`Ruxsat berish: ${grantName ?? ''}`}
          description="Darhol tasdiqlangan bo‘ladi va xodimga xabar boradi."
          submitLabel="Saqlash"
          onSubmit={(input) => staffAttendanceService.grantRequest(grantUser, input)}
          onClose={() => setGranting(false)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.all })}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Jadvallar
function SchedulesTab({ canManage, rows, loading, error, onRetry }: { canManage: boolean; rows: ScheduleRow[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const queryClient = useQueryClient();
  const today = tashkentDate();
  const year = Number(today.slice(0, 4));
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const [exception, setException] = useState({ userId: '', date: '', type: 'DAY_OFF' as 'DAY_OFF' | 'CUSTOM_HOURS', startTime: '', endTime: '', reason: '' });
  const range = { from: shiftDate(today, -7), to: shiftDate(today, 60) };
  const holidays = useQuery({ queryKey: queryKeys.staffAttendance.holidays(year), queryFn: () => staffAttendanceService.holidays(year) });
  const exceptions = useQuery({ queryKey: queryKeys.staffAttendance.exceptions(range.from, range.to), queryFn: () => staffAttendanceService.exceptions(range.from, range.to) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.all });
  const onDone = (response: { message: string }) => {
    toast.success(response.message);
    refresh();
  };
  const onFail = (error: unknown) => toast.error(getErrorMessage(error));

  const addHoliday = useMutation({ mutationFn: () => staffAttendanceService.addHoliday(holiday), onSuccess: (response) => (onDone(response), setHoliday({ date: '', name: '' })), onError: onFail });
  const removeHoliday = useMutation({ mutationFn: staffAttendanceService.removeHoliday, onSuccess: onDone, onError: onFail });
  const saveException = useMutation({
    mutationFn: () =>
      staffAttendanceService.saveException(exception.userId, {
        date: exception.date,
        type: exception.type,
        reason: exception.reason.trim(),
        ...(exception.type === 'CUSTOM_HOURS' ? { startTime: exception.startTime, endTime: exception.endTime } : {}),
      }),
    onSuccess: (response) => (onDone(response), setException((value) => ({ ...value, date: '', reason: '' }))),
    onError: onFail,
  });
  const removeException = useMutation({ mutationFn: staffAttendanceService.removeException, onSuccess: onDone, onError: onFail });
  const scheduleText = (row: ScheduleRow) => {
    const schedule = row.schedule;
    if (!schedule) return 'Belgilanmagan — kelish kutilmaydi';
    if (schedule.mode === 'LESSONS') return `Dars jadvali bo‘yicha (darsdan ${schedule.lessonLeadMinutes} daq oldin)`;
    const days = WEEK_DAY_SHORT.filter((day) => schedule.workDays.includes(day.key))
      .map((day) => day.label)
      .join(', ');
    return `${days} · ${schedule.startTime}–${schedule.endTime}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : loading ? (
          <TableSkeleton columns={4} />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Xodim</TH>
                  <TH>Jadval</TH>
                  <TH>Imtiyoz</TH>
                  <TH>
                    <span className="sr-only">Amallar</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.userId}>
                    <TD>
                      <p className="font-medium text-fg">{row.name}</p>
                      <p className="text-caption text-fg-subtle">{row.position}</p>
                    </TD>
                    <TD className={row.schedule ? 'text-fg' : 'text-fg-subtle'}>
                      {scheduleText(row)}
                      {row.nextChange && <span className="block text-caption text-fg-subtle">{displayDate(row.nextChange)} dan yangi jadval</span>}
                    </TD>
                    <TD className="text-fg-muted">{row.schedule ? `${row.schedule.graceMinutes} daq` : '—'}</TD>
                    <TD className="text-right">
                      {canManage && (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                          {row.schedule ? 'O‘zgartirish' : 'Belgilash'}
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {rows.length === 0 && <p className="p-6 text-center text-body text-fg-subtle">Davomati yuritiladigan xodim yo‘q</p>}
          </TableContainer>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="text-label font-semibold text-fg">Dam olish (bayram) kunlari, {year}</h2>
          {canManage && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addHoliday.mutate();
              }}
            >
              <FormField label="Sana" htmlFor="holiday-date">
                <Input id="holiday-date" type="date" value={holiday.date} onChange={(event) => setHoliday((value) => ({ ...value, date: event.target.value }))} />
              </FormField>
              <FormField label="Nomi" htmlFor="holiday-name">
                <Input id="holiday-name" value={holiday.name} maxLength={100} onChange={(event) => setHoliday((value) => ({ ...value, name: event.target.value }))} placeholder="Mustaqillik kuni" />
              </FormField>
              <Button type="submit" variant="secondary" loading={addHoliday.isPending} disabled={!holiday.date || holiday.name.trim().length < 2}>
                Qo‘shish
              </Button>
            </form>
          )}
          <ul className="divide-y divide-border">
            {(holidays.data ?? []).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-body">
                <span>
                  <span className="tabular-nums">{displayDate(item.date)}</span> — {item.name}
                </span>
                {canManage && (
                  <Button size="icon" variant="ghost" aria-label={`${item.name} — olib tashlash`} onClick={() => removeHoliday.mutate(item.id)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
            {holidays.data?.length === 0 && <li className="py-2 text-body text-fg-subtle">Bayram kunlari kiritilmagan</li>}
          </ul>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-label font-semibold text-fg">Vaqtinchalik o‘zgarishlar (bitta kun)</h2>
          {canManage && (
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                saveException.mutate();
              }}
            >
              <FormField label="Xodim" htmlFor="exception-user">
                <Select id="exception-user" value={exception.userId} onChange={(event) => setException((value) => ({ ...value, userId: event.target.value }))}>
                  <option value="">Tanlang</option>
                  {rows.map((row) => (
                    <option key={row.userId} value={row.userId}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Sana" htmlFor="exception-date">
                <Input id="exception-date" type="date" value={exception.date} onChange={(event) => setException((value) => ({ ...value, date: event.target.value }))} />
              </FormField>
              <FormField label="O‘zgarish" htmlFor="exception-type">
                <Select id="exception-type" value={exception.type} onChange={(event) => setException((value) => ({ ...value, type: event.target.value as 'DAY_OFF' | 'CUSTOM_HOURS' }))}>
                  <option value="DAY_OFF">Dam oladi</option>
                  <option value="CUSTOM_HOURS">Boshqa soatlarda ishlaydi</option>
                </Select>
              </FormField>
              {exception.type === 'CUSTOM_HOURS' ? (
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Dan" htmlFor="exception-start">
                    <Input id="exception-start" type="time" value={exception.startTime} onChange={(event) => setException((value) => ({ ...value, startTime: event.target.value }))} />
                  </FormField>
                  <FormField label="Gacha" htmlFor="exception-end">
                    <Input id="exception-end" type="time" value={exception.endTime} onChange={(event) => setException((value) => ({ ...value, endTime: event.target.value }))} />
                  </FormField>
                </div>
              ) : (
                <span aria-hidden />
              )}
              <FormField label="Sabab" htmlFor="exception-reason">
                <Input id="exception-reason" value={exception.reason} maxLength={255} onChange={(event) => setException((value) => ({ ...value, reason: event.target.value }))} />
              </FormField>
              <div className="flex items-end">
                <Button type="submit" variant="secondary" loading={saveException.isPending} disabled={!exception.userId || !exception.date || exception.reason.trim().length < 3}>
                  Saqlash
                </Button>
              </div>
            </form>
          )}
          <ul className="divide-y divide-border">
            {(exceptions.data ?? []).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-body">
                <span>
                  <span className="tabular-nums">{displayDate(item.date)}</span> — {item.name}: {item.type === 'DAY_OFF' ? 'dam oladi' : `${item.startTime}–${item.endTime}`}
                  <span className="block text-caption text-fg-subtle">{item.reason}</span>
                </span>
                {canManage && (
                  <Button size="icon" variant="ghost" aria-label="O‘zgarishni bekor qilish" onClick={() => removeException.mutate(item.id)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
            {exceptions.data?.length === 0 && <li className="py-2 text-body text-fg-subtle">Yaqin kunlarga o‘zgarish yo‘q</li>}
          </ul>
        </Card>
      </div>

      {editing && <ScheduleModal row={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

/** Xodimlar davomati — rahbar paneli: bugungi holat, hisobot, ruxsat so'rovlari va ish jadvallari */
export default function StaffAttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (TABS.some((item) => item.value === searchParams.get('tab')) ? searchParams.get('tab') : 'today') as TabKey;
  const detailUser = searchParams.get('user');
  const detailDate = searchParams.get('date');
  const canManage = usePermission(PERMISSIONS.STAFF_ATTENDANCE_MANAGE);
  const canDisplay = usePermission(PERMISSIONS.STAFF_ATTENDANCE_DISPLAY);
  const schedules = useQuery({ queryKey: queryKeys.staffAttendance.schedules, queryFn: staffAttendanceService.schedules });

  const update = (changes: Record<string, string | null>) =>
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      return params;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Xodimlar davomati"
        description="QR orqali kelish-ketish, kechikishlar, ruxsatlar va ish jadvallari"
        actions={
          canDisplay && (
            <Button variant="secondary" leftIcon={<MonitorSmartphone className="size-4" aria-hidden />} onClick={() => window.open('/reception-qr', '_blank', 'noopener')}>
              QR ekranni ochish
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(value) => update({ tab: value === 'today' ? null : value })} panels={false}>
        <TabList label="Davomat bo‘limlari">
          {TABS.map((item) => (
            <Tab key={item.value} value={item.value} icon={<item.icon className="size-4" aria-hidden />}>
              {item.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>

      {tab === 'today' && <TodayTab onOpen={(userId, date) => update({ user: userId, date })} />}
      {tab === 'report' && <ReportTab />}
      {tab === 'requests' && <RequestsTab canManage={canManage} people={schedules.data ?? []} />}
      {tab === 'schedules' && (
        <SchedulesTab canManage={canManage} rows={schedules.data ?? []} loading={schedules.isPending} error={schedules.error} onRetry={() => void schedules.refetch()} />
      )}

      {detailUser && detailDate && /^\d{4}-\d{2}-\d{2}$/.test(detailDate) && (
        <DayDetailDrawer key={`${detailUser}:${detailDate}`} userId={detailUser} date={detailDate} onClose={() => update({ user: null, date: null })} />
      )}
    </div>
  );
}
