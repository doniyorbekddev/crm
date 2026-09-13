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

interface UnlockSalaryModalProps {
  period: SalaryPeriod;
  onClose: () => void;
  onSaved: () => void;
}

/** Tasdiqlangan maoshni qayta ochish — sabab majburiy, auditga yoziladi */
export function UnlockSalaryModal({ period, onClose, onSaved }: UnlockSalaryModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unlock = useMutation({
    mutationFn: () => salaryService.unlock(period.id, reason.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <Modal
      open
      title="Maoshni qayta ochish"
      description={`${period.teacher.firstName} ${period.teacher.lastName} · ${period.label} · ${formatMoney(period.totalAmount)}`}
      onClose={onClose}
      closeDisabled={unlock.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={unlock.isPending}>
            Bekor qilish
          </Button>
          <Button variant="danger" loading={unlock.isPending} disabled={reason.trim().length < 3} onClick={() => unlock.mutate()}>
            Qayta ochish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Alert tone="warning">
          Maosh yana “Hisoblandi” holatiga qaytadi: qayta hisoblash, bonus va jarima o‘zgartirish mumkin bo‘ladi. O‘qituvchi xabar
          oladi, amal audit jurnaliga yoziladi.
        </Alert>
        <FormField label="Sabab" htmlFor="unlock-reason" required hint="Masalan: darslar soni noto‘g‘ri kiritilgan">
          <Textarea id="unlock-reason" rows={3} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
