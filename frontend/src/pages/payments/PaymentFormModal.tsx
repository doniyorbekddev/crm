import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
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
import { Textarea } from '@/components/ui/Textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { getErrorMessage, getErrorStatus, getFieldErrors } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService } from '@/services/payments.service';
import { studentsService } from '@/services/students.service';
import type { PaymentPayload } from '@/types/payment';
import type { StudentItem, StudentListParams } from '@/types/student';
import { formatMoney, formatPhone } from '@/utils/format';
import { createIdempotencyKey } from '@/utils/idempotency';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from '@/utils/paymentLabels';

const paymentFormSchema = z.object({
  amount: z.string().refine((value) => /^\d{4,9}$/.test(value) && Number(value) >= 1000, 'Eng kam to‘lov — 1 000 so‘m'),
  method: z.enum(PAYMENT_METHOD_ORDER),
  paidAt: z.string(),
  comment: z.string().trim().max(500, 'Izoh juda uzun'),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

function toPayload(studentId: string, values: PaymentFormValues): PaymentPayload {
  return {
    studentId,
    amount: Number(values.amount),
    method: values.method,
    ...(values.paidAt ? { paidAt: new Date(`${values.paidAt}T12:00:00`).toISOString() } : {}),
    ...(values.comment ? { comment: values.comment } : {}),
  };
}

interface PaymentFormModalProps {
  /** Oldindan tanlangan o‘quvchi (o‘quvchilar sahifasidan ochilganda) */
  student?: StudentItem;
  onClose: () => void;
  onSaved: () => void;
}

export function PaymentFormModal({ student, onClose, onSaved }: PaymentFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudentItem | null>(student ?? null);
  // Forma ochilishi uchun bitta kalit: ikki marta bosish yoki qayta urinish ikkinchi to'lov yaratmaydi
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [duplicate, setDuplicate] = useState<{ message: string; values: PaymentFormValues } | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);

  const params: StudentListParams = { page: 1, limit: 8, status: 'ACTIVE', ...(search ? { search } : {}) };
  const studentsQuery = useQuery({
    queryKey: queryKeys.students.list(params),
    queryFn: () => studentsService.list(params),
    placeholderData: keepPreviousData,
    enabled: !selected,
  });

  const defaultValues: PaymentFormValues = {
    amount: '',
    method: 'CASH',
    paidAt: new Date().toISOString().slice(0, 10),
    comment: '',
  };

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(paymentFormSchema), defaultValues });

  const amount = useWatch({ control, name: 'amount' });
  const remaining = selected?.debt?.remaining ?? 0;
  const afterPayment = remaining - Number(amount || 0);

  const save = useMutation({
    mutationFn: ({ values, confirmDuplicate }: { values: PaymentFormValues; confirmDuplicate: boolean }) => {
      if (!selected) throw new Error('O‘quvchi tanlanmagan');
      return paymentsService.create({
        ...toPayload(selected.id, values),
        idempotencyKey,
        ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
      });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error, variables) => {
      const isDuplicate =
        getErrorStatus(error) === 409 && getFieldErrors(error).some((detail) => detail.field === 'duplicatePayment');
      if (isDuplicate) {
        setDuplicate({ message: getErrorMessage(error), values: variables.values });
        return;
      }
      if (!applyFieldErrors(error, setError, ['amount', 'method'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setDuplicate(null);
    save.mutate({ values, confirmDuplicate: false });
  });

  return (
    <Modal
      open
      title="To‘lov qabul qilish"
      description={selected ? `${selected.firstName} ${selected.lastName} · ${selected.code}` : 'Avval o‘quvchini tanlang'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="payment-form" loading={save.isPending} disabled={!selected}>
            To‘lovni saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      {duplicate && (
        <Alert tone="warning" className="mb-4" title={duplicate.message}>
          <p>Ikki marta kiritilmaganini tekshiring. Bu alohida to‘lov bo‘lsa, saqlashingiz mumkin.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => save.mutate({ values: duplicate.values, confirmDuplicate: true })}
            >
              Baribir saqlash
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose} disabled={save.isPending}>
              Saqlamasdan yopish
            </Button>
          </div>
        </Alert>
      )}

      {!selected ? (
        <div className="space-y-3">
          <FormField label="O‘quvchini qidiring" htmlFor="payment-student-search" hint="Ism, telefon yoki ST-raqam">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input
                id="payment-student-search"
                autoFocus
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Ali Valiyev"
                className="pl-9"
              />
            </div>
          </FormField>

          {studentsQuery.isPending ? (
            <p className="py-4 text-center text-sm text-fg-muted">Yuklanmoqda…</p>
          ) : studentsQuery.isError ? (
            <Alert tone="error">{getErrorMessage(studentsQuery.error)}</Alert>
          ) : studentsQuery.data.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">O‘quvchi topilmadi</p>
          ) : (
            <ul className={cn('divide-y divide-border rounded-xl border border-border', studentsQuery.isPlaceholderData && 'opacity-60')}>
              {studentsQuery.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">
                        {item.firstName} {item.lastName}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {item.code} · {formatPhone(item.phone)} · {item.course.name}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-sm font-medium', (item.debt?.remaining ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>
                      {formatMoney(item.debt?.remaining ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form id="payment-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted p-3">
            <div>
              <p className="text-sm font-medium text-fg">
                {selected.firstName} {selected.lastName}
              </p>
              <p className="text-xs text-fg-muted">
                {selected.code} · {selected.course.name}
                {selected.group && ` · ${selected.group.name}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-fg-muted">Qolgan qarz</p>
              <p className="font-semibold text-fg">{formatMoney(remaining)}</p>
            </div>
            {!student && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(null);
                  setDuplicate(null);
                }}
                disabled={save.isPending}
              >
                O‘zgartirish
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Summa (so‘m)"
              htmlFor="payment-amount"
              error={errors.amount?.message}
              required
              hint={amount ? `To‘lovdan keyin: ${formatMoney(Math.max(afterPayment, 0))}` : `Eng ko‘pi: ${formatMoney(remaining)}`}
            >
              <Input id="payment-amount" autoFocus inputMode="numeric" invalid={Boolean(errors.amount)} {...register('amount')} />
            </FormField>
            <FormField label="To‘lov usuli" htmlFor="payment-method" error={errors.method?.message} required>
              <Select
                id="payment-method"
                invalid={Boolean(errors.method)}
                aria-describedby={errors.method ? fieldErrorId('payment-method') : undefined}
                {...register('method')}
              >
                {PAYMENT_METHOD_ORDER.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="To‘lov sanasi" htmlFor="payment-paidAt" error={errors.paidAt?.message}>
              <Input id="payment-paidAt" type="date" {...register('paidAt')} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Izoh" htmlFor="payment-comment" error={errors.comment?.message} hint="Ixtiyoriy">
                <Textarea id="payment-comment" rows={2} {...register('comment')} />
              </FormField>
            </div>
          </div>

          {afterPayment < 0 && <Alert tone="warning">Summa qolgan qarzdan ko‘p — server bunday to‘lovni qabul qilmaydi.</Alert>}
        </form>
      )}
    </Modal>
  );
}
