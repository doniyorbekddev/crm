import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { paymentsService } from '@/services/payments.service';
import type { PaymentItem, PaymentMethod } from '@/types/payment';
import { formatDate, formatMoney } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from '@/utils/paymentLabels';

interface RefundPaymentModalProps {
  payment: PaymentItem;
  onClose: () => void;
  onRefunded: () => void;
}

/** To‘lovni to‘liq yoki qisman qaytarish — kvitansiya o‘chirilmaydi, qaytarish alohida yoziladi */
export function RefundPaymentModal({ payment, onClose, onRefunded }: RefundPaymentModalProps) {
  const refundable = payment.amount - payment.refundedAmount;
  const [amount, setAmount] = useState(String(refundable));
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const refund = useMutation({
    mutationFn: () => paymentsService.refund(payment.id, { amount: Number(amount), method, reason: reason.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      onRefunded();
    },
    onError: (error) => {
      const fields = getFieldErrors(error);
      if (fields.length > 0) setErrors(Object.fromEntries(fields.map((field) => [field.field, field.message])));
      else setFormError(getErrorMessage(error));
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    const value = Number(amount);
    if (!/^\d{4,9}$/.test(amount) || value < 1000) next.amount = 'Eng kam qaytarish — 1 000 so‘m';
    else if (value > refundable) next.amount = `Eng ko‘pi ${formatMoney(refundable)} qaytarish mumkin`;
    if (reason.trim().length < 5) next.reason = 'Sabab kamida 5 belgidan iborat bo‘lsin';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) refund.mutate();
  };

  return (
    <Modal
      open
      title="Pulni qaytarish"
      description={`${payment.code} · ${payment.student.firstName} ${payment.student.lastName}`}
      onClose={onClose}
      closeDisabled={refund.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={refund.isPending}>
            Yopish
          </Button>
          <Button variant="danger" loading={refund.isPending} onClick={submit}>
            Qaytarish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">To‘lov ({formatDate(payment.paidAt)})</span>
            <span className="font-medium text-fg">{formatMoney(payment.amount)}</span>
          </div>
          {payment.refundedAmount > 0 && (
            <div className="mt-1 flex justify-between">
              <span className="text-fg-muted">Avval qaytarilgan</span>
              <span className="text-fg">{formatMoney(payment.refundedAmount)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between">
            <span className="text-fg-muted">Qaytarish mumkin</span>
            <span className="font-semibold text-fg">{formatMoney(refundable)}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Summa (so‘m)" htmlFor="refund-amount" error={errors.amount} required>
            <Input
              id="refund-amount"
              autoFocus
              inputMode="numeric"
              value={amount}
              invalid={Boolean(errors.amount)}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
            />
          </FormField>
          <FormField label="Qaytarish usuli" htmlFor="refund-method" error={errors.method} required hint="Pul shu usulga mos kassadan chiqadi">
            <Select id="refund-method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {PAYMENT_METHOD_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="Sabab" htmlFor="refund-reason" error={errors.reason} required>
          <Textarea id="refund-reason" rows={2} value={reason} placeholder="Kursni erta tugatdi" onChange={(event) => setReason(event.target.value)} />
        </FormField>

        <Alert tone="warning">
          Qaytarilgan summa o‘quvchi qarziga qo‘shiladi va o‘qituvchi foizidan proporsional ayiriladi. Kvitansiya tarixda qoladi.
        </Alert>
      </div>
    </Modal>
  );
}
