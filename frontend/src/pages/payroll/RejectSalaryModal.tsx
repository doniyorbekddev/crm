import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { salaryService } from '@/services/salary.service';
import type { SalaryPeriod } from '@/types/teacher';
import { formatMoney } from '@/utils/format';

interface RejectSalaryModalProps {
  period: SalaryPeriod;
  onClose: () => void;
  onSaved: () => void;
}

/** Ko'rib chiqilayotgan maoshni rad etish — sabab majburiy, yuborgan xodim xabar oladi */
export function RejectSalaryModal({ period, onClose, onSaved }: RejectSalaryModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reject = useMutation({
    mutationFn: () => salaryService.reject(period.id, reason.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <Modal
      open
      title="Maoshni rad etish"
      description={`${period.payee.firstName} ${period.payee.lastName} · ${period.label} · ${formatMoney(period.totalAmount)}`}
      onClose={onClose}
      closeDisabled={reject.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={reject.isPending}>
            Bekor qilish
          </Button>
          <Button variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>
            Rad etish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Alert tone="info">Maosh “Hisoblandi” holatiga qaytadi. Tuzatilgach buxgalter uni qayta tasdiqlashga yuboradi.</Alert>
        <FormField label="Sabab" htmlFor="reject-reason" required hint="Masalan: KPI natijasi kiritilmagan">
          <Textarea id="reject-reason" rows={3} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
