import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, FileText, Fingerprint, LogIn, LogOut, QrCode, Timer, UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { getErrorMessage, getErrorStatus } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { StaffToday } from '@/types/staffAttendance';
import {
  displayDate,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_TONES,
  REQUEST_TYPE_LABELS,
  shortDuration,
  STAFF_ACTION_LABELS,
  tashkentDate,
  tashkentTime,
} from '@/utils/staffAttendanceLabels';
import { PermissionRequestModal } from './PermissionRequestModal';
import { QrScanner } from './QrScanner';
import { ScanSheet } from './ScanSheet';
import { planText, StaffStatusBadge } from './StaffStatus';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

/** Hozirgacha ishlangan vaqt: server hisoblagan qiymat + ma'lumot kelganidan beri o'tgan vaqt (qurilma soatiga bog'liq emas) */
function useLiveWorked(today: StaffToday, receivedAt: number): number | null {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { day } = today;
  if (day.workedSeconds === null) return null;
  if (day.status !== 'WORKING') return day.workedSeconds;
  return day.workedSeconds + Math.max(0, Math.floor((tick - receivedAt) / 1000));
}

function TodayCard({ today, receivedAt, onScan }: { today: StaffToday; receivedAt: number; onScan: () => void }) {
  const { day } = today;
  const worked = useLiveWorked(today, receivedAt);
  const breakEvent = [...today.events].reverse().find((event) => event.type === 'BREAK_START');
  const rows = [
    { icon: LogIn, label: 'Keldi', value: tashkentTime(day.checkInAt) },
    { icon: Coffee, label: 'Tanaffus', value: day.phase === 'ON_BREAK' ? `${tashkentTime(breakEvent?.occurredAt)} dan` : shortDuration(day.breakSeconds || null) },
    { icon: LogOut, label: 'Ketdi', value: tashkentTime(day.checkOutAt) },
    { icon: Timer, label: 'Ish vaqti', value: shortDuration(worked) },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-caption text-fg-subtle">Bugun, {displayDate(day.date)}</p>
          <StaffStatusBadge day={day} />
          <p className="flex items-center gap-1.5 text-body text-fg-muted">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            Jadval: {planText(day)}
          </p>
          {day.lessons.length > 0 && (
            <p className="text-caption text-fg-subtle">{day.lessons.map((lesson) => `${lesson.groupName} ${lesson.startTime}–${lesson.endTime}`).join(' · ')}</p>
          )}
          {day.excuseLabel && <p className="text-caption text-accent">Ruxsat: {day.excuseLabel}</p>}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button size="lg" onClick={onScan} leftIcon={<QrCode className="size-5" aria-hidden />} disabled={today.actions.length === 0}>
            {today.actions.length === 0 ? 'Ish kuni yakunlangan' : 'QR kodni skanerlash'}
          </Button>
          {today.actions.length > 0 && (
            <p className="text-caption text-fg-subtle sm:text-right">Keyingi amal: {today.actions.map((action) => STAFF_ACTION_LABELS[action]).join(' yoki ')}</p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="border-border p-4 not-last:border-r max-sm:nth-2:border-r-0 max-sm:nth-[-n+2]:border-b">
            <dt className="flex items-center gap-1.5 text-caption text-fg-subtle">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className="mt-1 text-h4 font-semibold text-fg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Xodimning shaxsiy davomat sahifasi: bugungi holat, QR skanerlash, oylik tarix va ruxsat so'rovlari */
export default function MyAttendancePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const qrToken = searchParams.get('qr');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const now = tashkentDate();
  const [month, setMonth] = useState(() => ({ year: Number(now.slice(0, 4)), month: Number(now.slice(5, 7)) }));

  const todayQuery = useQuery({ queryKey: queryKeys.staffAttendance.today, queryFn: staffAttendanceService.today, refetchInterval: 60_000, retry: false });
  const notTracked = getErrorStatus(todayQuery.error) === 403;
  const monthQuery = useQuery({
    queryKey: queryKeys.staffAttendance.myMonth(month.year, month.month),
    queryFn: () => staffAttendanceService.myMonth(month.year, month.month),
    enabled: todayQuery.isSuccess,
  });
  const requestsQuery = useQuery({ queryKey: queryKeys.staffAttendance.myRequests, queryFn: staffAttendanceService.myRequests, enabled: todayQuery.isSuccess });
  const cancel = useMutation({
    mutationFn: staffAttendanceService.cancelRequest,
    onSuccess: (response) => {
      toast.success(response.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.myRequests });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openToken = useCallback(
    (token: string) => {
      setScannerOpen(false);
      setSearchParams((params) => {
        params.set('qr', token);
        return params;
      });
    },
    [setSearchParams],
  );
  const closeSheet = () =>
    setSearchParams(
      (params) => {
        params.delete('qr');
        return params;
      },
      { replace: true },
    );

  const shiftMonth = (delta: number) =>
    setMonth((current) => {
      const index = current.year * 12 + current.month - 1 + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  const isCurrentMonth = month.year === Number(now.slice(0, 4)) && month.month === Number(now.slice(5, 7));
  const summary = monthQuery.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mening davomatim"
        description="Qabulxonadagi QR kod orqali kelish, tanaffus va ketishni belgilang"
        actions={
          todayQuery.isSuccess && (
            <Button variant="secondary" leftIcon={<FileText className="size-4" aria-hidden />} onClick={() => setRequestOpen(true)}>
              Ruxsat so‘rash
            </Button>
          )
        }
      />

      {todayQuery.isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : notTracked ? (
        <Card>
          <EmptyState
            icon={UserX}
            title="Hisobingiz uchun xodim davomati yuritilmaydi"
            description="Davomat o‘qituvchi va xodimlar uchun. Agar siz xodim bo‘lsangiz, administrator sizni “Xodimlar” bo‘limida hisobingizga bog‘lashi kerak."
          />
        </Card>
      ) : todayQuery.isError ? (
        <ErrorState error={todayQuery.error} onRetry={() => void todayQuery.refetch()} />
      ) : (
        <>
          {todayQuery.data.openPreviousDay && (
            <Alert tone="warning" title={`${displayDate(todayQuery.data.openPreviousDay)} kuni ketishingiz belgilanmagan`}>
              Ish vaqti o‘ylab topilmaydi — rahbaringizga ayting, u sabab bilan tuzatadi.
            </Alert>
          )}
          <TodayCard today={todayQuery.data} receivedAt={todayQuery.dataUpdatedAt} onScan={() => setScannerOpen(true)} />

          <section aria-labelledby="month-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="month-title" className="text-h4 font-semibold text-fg">
                {MONTHS[month.month - 1]} {month.year}
              </h2>
              <div className="flex gap-1">
                <Button variant="secondary" size="icon" aria-label="Oldingi oy" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <Button variant="secondary" size="icon" aria-label="Keyingi oy" disabled={isCurrentMonth} onClick={() => shiftMonth(1)}>
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard size="sm" title="Ish kunlari" value={summary ? `${summary.attendedDays} / ${summary.expectedDays}` : '—'} icon={CalendarDays} loading={monthQuery.isPending} />
              <StatCard size="sm" title="Davomat" value={summary?.attendancePercent !== null && summary ? `${summary.attendancePercent}%` : '—'} icon={Fingerprint} tone="primary" loading={monthQuery.isPending} />
              <StatCard size="sm" title="Kechikishlar" value={summary ? `${summary.lateDays} marta` : '—'} description={summary ? `${summary.lateMinutes} daqiqa` : undefined} icon={Clock3} tone="warning" loading={monthQuery.isPending} />
              <StatCard size="sm" title="Kelmagan" value={summary ? String(summary.absentDays) : '—'} description={summary ? `sababli: ${summary.excusedDays}` : undefined} icon={UserX} tone="danger" loading={monthQuery.isPending} />
              <StatCard size="sm" title="Ishlagan vaqt" value={summary ? shortDuration(summary.workedSeconds) : '—'} description="tanaffussiz" icon={Timer} tone="success" loading={monthQuery.isPending} />
            </div>
            <Card>
              {monthQuery.isError ? (
                <ErrorState error={monthQuery.error} onRetry={() => void monthQuery.refetch()} />
              ) : (
                <TableContainer>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Sana</TH>
                        <TH>Jadval</TH>
                        <TH>Keldi</TH>
                        <TH>Ketdi</TH>
                        <TH>Tanaffus</TH>
                        <TH>Ish vaqti</TH>
                        <TH>Holat</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {(monthQuery.data?.days ?? []).map((day) => (
                        <TR key={day.date}>
                          <TD className="whitespace-nowrap tabular-nums">{displayDate(day.date)}</TD>
                          <TD className="text-fg-muted">{planText(day)}</TD>
                          <TD className="tabular-nums">{tashkentTime(day.checkInAt)}</TD>
                          <TD className="tabular-nums">{tashkentTime(day.checkOutAt)}</TD>
                          <TD className="tabular-nums">{day.breakSeconds ? shortDuration(day.breakSeconds) : '—'}</TD>
                          <TD className="tabular-nums">{shortDuration(day.workedSeconds)}</TD>
                          <TD>
                            <StaffStatusBadge day={day} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {monthQuery.data?.days.length === 0 && <p className="p-6 text-center text-body text-fg-subtle">Bu oyda hali yozuv yo‘q</p>}
                </TableContainer>
              )}
            </Card>
          </section>

          <section aria-labelledby="requests-title" className="space-y-3">
            <h2 id="requests-title" className="text-h4 font-semibold text-fg">
              Ruxsat so‘rovlarim
            </h2>
            <Card>
              {requestsQuery.data && requestsQuery.data.length > 0 ? (
                <ul className="divide-y divide-border">
                  {requestsQuery.data.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-body font-medium text-fg">
                          {REQUEST_TYPE_LABELS[request.type]}: {displayDate(request.startDate)}
                          {request.endDate !== request.startDate && ` — ${displayDate(request.endDate)}`}
                          {request.time && (request.type === 'LATE_ARRIVAL' ? `, ${request.time} gacha` : `, ${request.time} dan`)}
                        </p>
                        <p className="text-caption text-fg-subtle">{request.reason}</p>
                        {request.decisionNote && <p className="text-caption text-fg-muted">Izoh: {request.decisionNote}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={REQUEST_STATUS_TONES[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
                        {request.status === 'PENDING' && (
                          <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === request.id} onClick={() => cancel.mutate(request.id)}>
                            Bekor qilish
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-6 text-center text-body text-fg-subtle">{requestsQuery.isPending ? 'Yuklanmoqda…' : 'So‘rovlar yo‘q'}</p>
              )}
            </Card>
          </section>
        </>
      )}

      <QrScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onToken={openToken} />
      {qrToken && !notTracked && (
        <ScanSheet
          key={qrToken}
          token={qrToken}
          onClose={closeSheet}
          onRescan={() => {
            closeSheet();
            setScannerOpen(true);
          }}
        />
      )}
      {requestOpen && (
        <PermissionRequestModal
          title="Ruxsat so‘rash"
          description="So‘rov rahbarga yuboriladi. Tasdiqlangani davomatda “sababli” bo‘ladi."
          submitLabel="Yuborish"
          onSubmit={staffAttendanceService.createRequest}
          onClose={() => setRequestOpen(false)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.all })}
        />
      )}
    </div>
  );
}
