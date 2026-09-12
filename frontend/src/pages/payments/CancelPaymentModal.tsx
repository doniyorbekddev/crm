import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { paymentsService } from '@/services/payments.service';
import type { PaymentItem } from '@/types/payment';
import { formatDate, formatMoney } from '@/utils/format';
import { PAYMENT_METHOD_LABELS } from '@/utils/paymentLabels';

const MIN_REASON = 5;

interface CancelPaymentModalProps {
  payment: PaymentItem;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelPaymentModal({ payment, onClose, onCancelled }: CancelPaymentModalProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tooShort = reason.trim().length < MIN_REASON;

  const cancel = useMutation({
    mutationFn: () => paymentsService.remove(payment.id, reason.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      onCancelled();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  return (
    <Modal
      open
      title="To‘lovni bekor qilish"
      description={`${payment.code} · ${payment.student.firstName} ${payment.student.lastName}`}
      onClose={onClose}
      closeDisabled={cancel.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
            Yopish
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => {
              setTouched(true);
              if (!tooShort) cancel.mutate();
            }}
          >
            Bekor qilish
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <Alert tone="warning" className="mb-4">
        {formatMoney(payment.amount)} ({PAYMENT_METHOD_LABELS[payment.method]}, {formatDate(payment.paidAt)}) bekor qilinadi va
        o‘quvchining qarzi shu summaga ortadi. Kvitansiya tarixda saqlanib qoladi.
      </Alert>
      <FormField
        label="Bekor qilish sababi"
        htmlFor="cancel-reason"
        required
        error={touched && tooShort ? 'Sabab kamida 5 belgidan iborat bo‘lsin' : undefined}
      >
        <Textarea
          id="cancel-reason"
          autoFocus
          rows={3}
          value={reason}
          placeholder="Masalan: ikki marta kiritilgan"
          invalid={touched && tooShort}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
        />
      </FormField>
    </Modal>
  );
}
