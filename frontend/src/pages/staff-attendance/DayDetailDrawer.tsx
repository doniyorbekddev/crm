import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, History } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { CorrectionInput, StaffAction } from '@/types/staffAttendance';
import { formatDateTime } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { displayDate, REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES, REQUEST_TYPE_LABELS, shortDuration, STAFF_EVENT_LABELS, tashkentTime } from '@/utils/staffAttendanceLabels';
import { planText, StaffStatusBadge } from './StaffStatus';

type CorrectionKind = CorrectionInput['action'];

const KIND_LABELS: Record<CorrectionKind, string> = {
  ADD: 'Yetishmayotgan hodisani qo‘shish',
  REPLACE: 'Hodisa vaqtini to‘g‘rilash',
  VOID: 'Noto‘g‘ri hodisani bekor qilish',
};

/**
 * Xodimning bir kuni: reja, hodisalar (bekor qilinganlari ham), tuzatishlar tarixi va tuzatish formasi.
 * Asl hodisa hech qachon o'zgartirilmaydi — tuzatish uni bekor qilib, yangisini sabab bilan qo'shadi.
 */
export function DayDetailDrawer({ userId, date, onClose }: { userId: string; date: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.STAFF_ATTENDANCE_MANAGE);
  const [kind, setKind] = useState<CorrectionKind>('ADD');
  const [type, setType] = useState<StaffAction>('CHECK_OUT');
  const [eventId, setEventId] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');

  const detail = useQuery({ queryKey: queryKeys.staffAttendance.day(userId, date), queryFn: () => staffAttendanceService.dayDetail(userId, date) });
  const activeEvents = detail.data?.events.filter((event) => !event.voided) ?? [];

  const correct = useMutation({
    mutationFn: () => {
      const input: CorrectionInput =
        kind === 'ADD'
          ? { action: 'ADD', type, time, reason: reason.trim() }
          : kind === 'REPLACE'
            ? { action: 'REPLACE', eventId, time, reason: reason.trim() }
            : { action: 'VOID', eventId, reason: reason.trim() };
      return staffAttendanceService.correct(userId, date, input);
    },
    onSuccess: (response) => {
      toast.success(response.message);
      queryClient.setQueryData(queryKeys.staffAttendance.day(userId, date), response.data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.all });
      setTime('');
      setReason('');
      setEventId('');
    },
  });
  const fieldError = (field: string) => getFieldErrors(correct.error).find((item) => item.field === field)?.message;
  const ready = reason.trim().length >= 3 && (kind === 'VOID' ? Boolean(eventId) : Boolean(time) && (kind === 'ADD' || Boolean(eventId)));

  return (
    <Drawer open onClose={onClose} title={detail.data?.subject.name ?? 'Davomat'} description={`${displayDate(date)}${detail.data ? ` · ${detail.data.subject.position}` : ''}`} size="lg">
      {detail.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2 rounded-card border border-border p-4">
            <StaffStatusBadge day={detail.data.day} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body">
              <dt className="text-fg-subtle">Jadval</dt>
              <dd>{planText(detail.data.day)}</dd>
              <dt className="text-fg-subtle">Keldi / ketdi</dt>
              <dd className="tabular-nums">
                {tashkentTime(detail.data.day.checkInAt)} — {tashkentTime(detail.data.day.checkOutAt)}
              </dd>
              <dt className="text-fg-subtle">Tanaffus</dt>
              <dd>{detail.data.day.breakSeconds ? shortDuration(detail.data.day.breakSeconds) : '—'}</dd>
              <dt className="text-fg-subtle">Ish vaqti</dt>
              <dd>{shortDuration(detail.data.day.workedSeconds)}</dd>
            </dl>
            {detail.data.day.reviewReason && <Alert tone="warning">{detail.data.day.reviewReason} — vaqt o‘ylab topilmaydi, quyida sabab bilan tuzating.</Alert>}
          </section>

          <section aria-labelledby="events-title" className="space-y-2">
            <h3 id="events-title" className="text-label font-semibold text-fg">
              Hodisalar
            </h3>
            {detail.data.events.length === 0 ? (
              <p className="text-body text-fg-subtle">Bu kunda hodisa yo‘q</p>
            ) : (
              <ul className="divide-y divide-border rounded-card border border-border">
                {detail.data.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className={event.voided ? 'text-fg-subtle line-through' : 'text-fg'}>
                      <span className="font-semibold tabular-nums">{event.time}</span> — {STAFF_EVENT_LABELS[event.type]}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge tone={event.source === 'QR' ? 'info' : 'accent'}>{event.source === 'QR' ? 'QR' : 'Tuzatish'}</Badge>
                      {event.voided && <Badge tone="neutral">bekor qilingan</Badge>}
                      {event.fromOwnDisplay && (
                        <Badge tone="warning" title="QR ekranini xodimning o‘zi ochgan — tekshirib qo‘ying">
                          <AlertTriangle className="size-3" aria-hidden /> o‘z ekranidan
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.data.requests.length > 0 && (
            <section aria-labelledby="requests-day-title" className="space-y-2">
              <h3 id="requests-day-title" className="text-label font-semibold text-fg">
                Ruxsat so‘rovlari
              </h3>
              <ul className="space-y-1">
                {detail.data.requests.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-2 text-body">
                    <span>
                      {REQUEST_TYPE_LABELS[request.type]}
                      {request.time ? ` (${request.time})` : ''}: {request.reason}
                    </span>
                    <Badge tone={REQUEST_STATUS_TONES[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {canManage && (
            <section aria-labelledby="correct-title" className="space-y-3 rounded-card border border-border p-4">
              <h3 id="correct-title" className="text-label font-semibold text-fg">
                Tuzatish
              </h3>
              {correct.isError && !fieldError('reason') && <Alert tone="error">{getErrorMessage(correct.error)}</Alert>}
              <FormField label="Nima qilinadi" htmlFor="correction-kind">
                <Select id="correction-kind" value={kind} onChange={(event) => setKind(event.target.value as CorrectionKind)}>
                  {(Object.keys(KIND_LABELS) as CorrectionKind[]).map((key) => (
                    <option key={key} value={key}>
                      {KIND_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                {kind === 'ADD' ? (
                  <FormField label="Hodisa" htmlFor="correction-type">
                    <Select id="correction-type" value={type} onChange={(event) => setType(event.target.value as StaffAction)}>
                      {(Object.keys(STAFF_EVENT_LABELS) as StaffAction[]).map((key) => (
                        <option key={key} value={key}>
                          {STAFF_EVENT_LABELS[key]}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ) : (
                  <FormField label="Qaysi hodisa" htmlFor="correction-event">
                    <Select id="correction-event" value={eventId} onChange={(event) => setEventId(event.target.value)}>
                      <option value="">Tanlang</option>
                      {activeEvents.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.time} — {STAFF_EVENT_LABELS[event.type]}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
                {kind !== 'VOID' && (
                  <FormField label="To‘g‘ri vaqt" htmlFor="correction-time" error={fieldError('time')}>
                    <Input id="correction-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                  </FormField>
                )}
              </div>
              <FormField label="Sabab (majburiy)" htmlFor="correction-reason" error={fieldError('reason')}>
                <Textarea id="correction-reason" rows={2} maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Masalan: telefon zaryadsiz edi, qabulxona tasdiqladi" />
              </FormField>
              <Button onClick={() => correct.mutate()} loading={correct.isPending} disabled={!ready}>
                Tuzatishni saqlash
              </Button>
              <p className="text-caption text-fg-subtle">Asl yozuv o‘chirilmaydi: u “bekor qilingan” bo‘lib qoladi, tuzatish esa kim, qachon va nima sababdan qilgani bilan tarixda saqlanadi.</p>
            </section>
          )}

          {detail.data.corrections.length > 0 && (
            <section aria-labelledby="history-title" className="space-y-2">
              <h3 id="history-title" className="flex items-center gap-1.5 text-label font-semibold text-fg">
                <History className="size-4" aria-hidden />
                Tuzatishlar tarixi
              </h3>
              <ul className="space-y-2">
                {detail.data.corrections.map((correction) => (
                  <li key={correction.id} className="rounded-card border border-border p-3 text-body">
                    <p className="font-medium text-fg">{correction.reason}</p>
                    <p className="text-caption text-fg-subtle">
                      {correction.createdBy ?? '—'} · {formatDateTime(correction.createdAt)}
                    </p>
                    <p className="mt-1 text-caption text-fg-muted">
                      Oldin: {correction.before.map((item) => `${item.time} ${item.label}`).join(', ') || 'yo‘q'}
                      <br />
                      Keyin: {correction.after.map((item) => `${item.time} ${item.label}`).join(', ') || 'yo‘q'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
