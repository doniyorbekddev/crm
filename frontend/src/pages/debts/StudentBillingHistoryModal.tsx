import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { currentReportingPeriod, periodKey } from '@/hooks/useReportingPeriod';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { billingService } from '@/services/billing.service';
import { paymentScheduleService } from '@/services/paymentSchedule.service';
import { paymentsService } from '@/services/payments.service';
import type { StudentBillingHistory } from '@/types/billing';
import { periodKeyLabel } from '@/utils/billingLabels';
import { formatDate, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES } from '@/utils/scheduleLabels';

interface StudentBillingHistoryModalProps {
  studentId: string;
  onClose: () => void;
}

/**
 * C. O'quvchi qarz tarixi: har oy majburiyati, qaysi to'lov qachon qaysi oyni yopgani, to'lovlar va qaytarishlar.
 * Ruxsat bo'lsa — to'lov taqsimotini tuzatish va kelgusi oylarni bekor qilish.
 */
export function StudentBillingHistoryModal({ studentId, onClose }: StudentBillingHistoryModalProps) {
  const canReallocate = usePermission(PERMISSIONS.PAYMENT_REALLOCATE);
  const canCancel = usePermission(PERMISSIONS.PAYMENT_CANCEL_CHARGE);
  const [reallocating, setReallocating] = useState<StudentBillingHistory['payments'][number] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const historyQuery = useQuery({ queryKey: queryKeys.debts.history(studentId), queryFn: () => billingService.history(studentId) });
  const data = historyQuery.data;

  return (
    <Modal
      open
      size="xl"
      title="Qarz tarixi"
      description={data ? `${data.student.firstName} ${data.student.lastName} · ${data.student.code}` : undefined}
      onClose={onClose}
      footer={
        <>
          {canCancel && data && (
            <Button variant="secondary" leftIcon={<Ban className="size-4" aria-hidden />} onClick={() => setCancelling(true)}>
              Oylarni bekor qilish
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
        </>
      }
    >
      {historyQuery.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Yuklanmoqda">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : historyQuery.isError ? (
        <Alert tone="error">{getErrorMessage(historyQuery.error)}</Alert>
      ) : (
        data && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Shartnoma', formatMoney(data.contractTotal)],
                ['To‘langan', formatMoney(data.paidTotal)],
                ['Muddati kelgan qarz', formatMoney(data.debt)],
                ['Kelgusi to‘lovlar', formatMoney(data.upcoming)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-card border border-border p-3">
                  <dt className="text-caption text-fg-muted">{label}</dt>
                  <dd className={label === 'Muddati kelgan qarz' && data.debt > 0 ? 'font-semibold text-danger' : 'font-semibold text-fg'}>{value}</dd>
                </div>
              ))}
            </dl>

            <section aria-label="Oylar bo‘yicha majburiyat">
              <h3 className="mb-2 text-label text-fg">Oylar bo‘yicha</h3>
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full min-w-[40rem] text-body">
                  <thead className="bg-surface-muted text-caption text-fg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Oy</th>
                      <th className="px-3 py-2 text-right font-medium">Majburiyat</th>
                      <th className="px-3 py-2 text-right font-medium">To‘langan</th>
                      <th className="px-3 py-2 text-right font-medium">Qoldiq</th>
                      <th className="px-3 py-2 text-left font-medium">Holat</th>
                      <th className="px-3 py-2 text-left font-medium">Qaysi to‘lovdan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.months.map((month) => (
                      <tr key={month.period}>
                        <td className="px-3 py-2">
                          <p className="text-fg">{month.label}</p>
                          <p className="text-caption text-fg-muted">muddat {formatDate(month.dueDate)}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(month.charge)}
                          {month.cancelledAmount > 0 && <p className="text-caption text-fg-muted">bekor: {formatMoney(month.cancelledAmount)}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(month.paid)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${month.remaining > 0 && month.due ? 'font-medium text-danger' : ''}`}>{formatMoney(month.remaining)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={CHARGE_STATUS_TONES[month.status]}>{CHARGE_STATUS_LABELS[month.status]}</Badge>
                          {month.closedAt && <p className="mt-0.5 text-caption text-fg-muted">{formatDate(month.closedAt)} yopildi</p>}
                          {month.cancelReason && <p className="mt-0.5 text-caption text-fg-muted">{month.cancelReason}</p>}
                        </td>
                        <td className="px-3 py-2 text-caption text-fg-muted">
                          {month.payments.length === 0
                            ? '—'
                            : month.payments.map((item) => (
                                <p key={`${item.paymentId}-${item.amount}`}>
                                  {item.code} · {formatDate(item.paidAt)} · {formatMoney(item.amount)}
                                  {!item.explicit && ' (avtomatik)'}
                                </p>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="To‘lovlar">
              <h3 className="mb-2 text-label text-fg">To‘lovlar</h3>
              {data.payments.length === 0 ? (
                <p className="text-body text-fg-muted">To‘lov yo‘q</p>
              ) : (
                <ul className="divide-y divide-border rounded-card border border-border">
                  {data.payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className={payment.isDeleted ? 'text-fg-subtle line-through' : ''}>
                        <p className="text-fg">
                          {payment.code} · {formatMoney(payment.amount)} · {payment.methodLabel}
                        </p>
                        <p className="text-caption text-fg-muted">
                          {formatDate(payment.paidAt)} kelib tushgan
                          {payment.refunded > 0 && ` · qaytarilgan ${formatMoney(payment.refunded)}`}
                          {payment.allocations.length > 0 && ` · ${payment.allocations.map((item) => `${periodKeyLabel(item.period)}: ${formatMoney(item.amount)}`).join(', ')}`}
                        </p>
                      </div>
                      {canReallocate && !payment.isDeleted && payment.refunded === 0 && (
                        <Button size="sm" variant="ghost" leftIcon={<Shuffle className="size-4" aria-hidden />} onClick={() => setReallocating(payment)}>
                          Taqsimotni tuzatish
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.refunds.length > 0 && (
                <ul className="mt-2 space-y-1 text-caption text-fg-muted" aria-label="Qaytarishlar">
                  {data.refunds.map((refund) => (
                    <li key={refund.id}>
                      {formatDate(refund.refundedAt)} · {refund.paymentCode} dan {formatMoney(refund.amount)} qaytarildi — {refund.reason}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )
      )}

      {reallocating && data && (
        <ReallocateModal studentId={studentId} payment={reallocating} months={data.months} onClose={() => setReallocating(null)} />
      )}
      {cancelling && data && <CancelChargesModal studentId={studentId} months={data.months} onClose={() => setCancelling(false)} />}
    </Modal>
  );
}

function useRefreshBilling(studentId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.paymentSchedule(studentId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
  };
}

function ReallocateModal({
  studentId,
  payment,
  months,
  onClose,
}: {
  studentId: string;
  payment: StudentBillingHistory['payments'][number];
  months: StudentBillingHistory['months'];
  onClose: () => void;
}) {
  const refresh = useRefreshBilling(studentId);
  // Shu to'lov egallagan summa bo'shaydi — har oy sig'imi = qoldiq + shu to'lov hissasi
  const own = new Map(payment.allocations.map((item) => [item.period, item.amount]));
  const options = months
    .filter((month) => month.status !== 'CANCELLED' && month.charge > 0)
    .map((month) => ({ period: month.period, label: month.label, capacity: month.remaining + (own.get(month.period) ?? 0) }))
    .filter((month) => month.capacity > 0);
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(payment.allocations.map((item) => [item.period, item.amount])));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(values).reduce<number>((sum, value) => sum + (value ?? 0), 0);

  const save = useMutation({
    mutationFn: () =>
      paymentsService.reallocate(payment.id, {
        allocations: Object.entries(values)
          .filter(([, value]) => (value ?? 0) > 0)
          .map(([period, amount]) => ({ period, amount: amount ?? 0 })),
        reason: reason.trim(),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      onClose();
    },
    onError: (failure) => setError(getFieldErrors(failure)[0]?.message ?? getErrorMessage(failure)),
  });

  return (
    <Modal
      open
      title="To‘lov taqsimotini tuzatish"
      description={`${payment.code} · ${formatMoney(payment.amount)} · ${formatDate(payment.paidAt)}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={total !== payment.amount || reason.trim().length < 5} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-caption text-fg-muted">To‘lov sanasi va kassa o‘zgarmaydi — faqat qaysi oy uchun ekanligi. Eski taqsimot tarixda qoladi.</p>
        {error && <Alert tone="error">{error}</Alert>}
        {options.map((month) => (
          <div key={month.period} className="grid grid-cols-[1fr_10rem] items-center gap-2">
            <span className="text-body text-fg">
              {month.label}
              <span className="block text-caption text-fg-muted">ko‘pi bilan {formatMoney(month.capacity)}</span>
            </span>
            <CurrencyInput
              aria-label={`${month.label} uchun summa`}
              value={values[month.period] ?? null}
              max={month.capacity}
              onValueChange={(next) => setValues((current) => ({ ...current, [month.period]: next }))}
            />
          </div>
        ))}
        <p className={total === payment.amount ? 'text-caption text-success' : 'text-caption text-danger'} role="status">
          Taqsimlangan {formatMoney(total)} / to‘lov {formatMoney(payment.amount)}
        </p>
        <FormField label="Sabab" htmlFor="reallocate-reason" required hint="Kamida 5 belgi — auditga yoziladi">
          <Textarea id="reallocate-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function CancelChargesModal({ studentId, months, onClose }: { studentId: string; months: StudentBillingHistory['months']; onClose: () => void }) {
  const refresh = useRefreshBilling(studentId);
  const currentKey = periodKey(currentReportingPeriod());
  // Faqat joriy va kelgusi, to'lov tushmagan oylar (server ham tekshiradi)
  const options = months.filter((month) => month.period >= currentKey && month.charge > 0 && month.paid === 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const amount = options.filter((month) => selected.includes(month.period)).reduce((sum, month) => sum + month.charge, 0);

  const save = useMutation({
    mutationFn: () => paymentScheduleService.cancel(studentId, { months: selected, reason: reason.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      onClose();
    },
    onError: (failure) => setError(getFieldErrors(failure)[0]?.message ?? getErrorMessage(failure)),
  });

  return (
    <Modal
      open
      title="Oy majburiyatlarini bekor qilish"
      description="Masalan, o‘quvchi o‘qishni tark etgach kelgusi oylar"
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Yopish
          </Button>
          <Button variant="danger" loading={save.isPending} disabled={selected.length === 0 || reason.trim().length < 5} onClick={() => save.mutate()}>
            Bekor qilish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {options.length === 0 ? (
          <p className="text-body text-fg-muted">Bekor qilinadigan oy yo‘q — faqat joriy va kelgusi, to‘lov tushmagan oylar bekor qilinadi.</p>
        ) : (
          options.map((month) => (
            <Checkbox
              key={month.period}
              label={`${month.label} — ${formatMoney(month.charge)}`}
              checked={selected.includes(month.period)}
              onChange={(event) =>
                setSelected((current) => (event.target.checked ? [...current, month.period] : current.filter((key) => key !== month.period)))
              }
            />
          ))
        )}
        {amount > 0 && <Alert tone="warning">{`Shartnoma jami summasi ${formatMoney(amount)} ga kamayadi (oylik to‘lov o‘zgarmaydi). Amal auditga yoziladi.`}</Alert>}
        <FormField label="Sabab" htmlFor="cancel-charges-reason" required hint="Kamida 5 belgi">
          <Textarea id="cancel-charges-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
