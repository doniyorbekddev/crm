import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { salaryService } from '@/services/salary.service';
import type { SalaryPaymentKind, SalaryPeriod } from '@/types/teacher';
import { formatDate, formatMoney } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from '@/utils/paymentLabels';
import { SALARY_PAYMENT_KIND_LABELS } from '@/utils/teacherLabels';

const schema = z.object({
  amount: z.string().refine((value) => /^\d{4,9}$/.test(value) && Number(value) >= 1000, 'Eng kam to‘lov — 1 000 so‘m'),
  method: z.enum(PAYMENT_METHOD_ORDER),
  accountId: z.string(),
  paidAt: z.string(),
  note: z.string().trim().max(255, 'Izoh juda uzun'),
});

type FormValues = z.infer<typeof schema>;

interface SalaryPaymentModalProps {
  period: SalaryPeriod;
  /** ADVANCE — hisoblangan, lekin tasdiqlanmagan maoshdan avans */
  kind?: SalaryPaymentKind;
  onClose: () => void;
  onSaved: () => void;
}

export function SalaryPaymentModal({ period, kind = 'SALARY', onClose, onSaved }: SalaryPaymentModalProps) {
  const isAdvance = kind === 'ADVANCE';
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.salaryForm,
    queryFn: salaryService.formLookups,
    staleTime: 5 * 60_000,
  });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: String(period.remainingAmount),
      method: 'CASH' as const,
      accountId: '',
      paidAt: new Date().toISOString().slice(0, 10),
      note: '',
    },
  });

  const amount = Number(useWatch({ control, name: 'amount' }) || 0);
  const afterPayment = period.remainingAmount - amount;

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      salaryService.pay(period.id, {
        kind,
        amount: Number(values.amount),
        method: values.method,
        ...(values.accountId ? { accountId: values.accountId } : {}),
        ...(values.paidAt ? { paidAt: new Date(`${values.paidAt}T12:00:00`).toISOString() } : {}),
        ...(values.note ? { note: values.note } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['amount', 'method', 'accountId'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  return (
    <Modal
      open
      title={isAdvance ? 'Avans berish' : 'Maosh to‘lovi'}
      description={`${period.payee.firstName} ${period.payee.lastName} · ${period.label}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="salary-payment-form" loading={save.isPending}>
            {isAdvance ? 'Avansni saqlash' : 'To‘lovni saqlash'}
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form id="salary-payment-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">{isAdvance ? 'Hisoblangan maosh (tasdiqlanmagan)' : 'Tasdiqlangan maosh'}</span>
            <span className="font-medium text-fg">{formatMoney(period.totalAmount)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-fg-muted">To‘langan</span>
            <span className="text-fg">{formatMoney(period.paidAmount)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-fg-muted">Qolgan</span>
            <span className="font-semibold text-fg">{formatMoney(period.remainingAmount)}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Summa (so‘m)"
            htmlFor="salary-amount"
            error={errors.amount?.message}
            required
            hint={amount > 0 ? `To‘lovdan keyin qoladi: ${formatMoney(Math.max(afterPayment, 0))}` : undefined}
          >
            <Input id="salary-amount" autoFocus inputMode="numeric" invalid={Boolean(errors.amount)} {...register('amount')} />
          </FormField>
          <FormField label="To‘lov usuli" htmlFor="salary-method" error={errors.method?.message} required>
            <Select
              id="salary-method"
              invalid={Boolean(errors.method)}
              aria-describedby={errors.method ? fieldErrorId('salary-method') : undefined}
              {...register('method')}
            >
              {PAYMENT_METHOD_ORDER.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Kassa / hisob"
            htmlFor="salary-accountId"
            error={errors.accountId?.message}
            hint="Tanlansa, hisob qoldig‘i kamayadi"
          >
            <Select id="salary-accountId" {...register('accountId')}>
              <option value="">Tanlanmagan</option>
              {(lookupsQuery.data?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatMoney(account.balance)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="To‘lov sanasi" htmlFor="salary-paidAt" error={errors.paidAt?.message}>
            <Input id="salary-paidAt" type="date" {...register('paidAt')} />
          </FormField>
        </div>

        <FormField label="Izoh" htmlFor="salary-note" error={errors.note?.message} hint="Ixtiyoriy">
          <Input id="salary-note" {...register('note')} />
        </FormField>

        {afterPayment < 0 && (
          <Alert tone="warning">
            Summa qolgan maoshdan ko‘p — server bunday to‘lovni qabul qilmaydi. Eng ko‘pi:{' '}
            {formatMoney(period.remainingAmount)}.
          </Alert>
        )}

        {period.payments.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-fg">Oldingi to‘lovlar</p>
            <ul className="divide-y divide-border rounded-xl border border-border text-sm">
              {period.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-fg-muted">
                    {SALARY_PAYMENT_KIND_LABELS[payment.kind]} · {formatDate(payment.paidAt)} · {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.account && ` · ${payment.account.name}`}
                  </span>
                  <span className="font-medium text-fg">{formatMoney(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
}
