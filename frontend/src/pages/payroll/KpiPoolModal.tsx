import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/api';
import { salaryService } from '@/services/salary.service';

/** Xodimning oylik KPI bonus fondi — tasdiqlangan oylarga ta'sir qilmaydi (ular nusxada saqlangan) */
export function KpiPoolModal({ employeeId, name, initial, onClose, onSaved }: { employeeId: string; name: string; initial: number; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<number | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const amount = value ?? 0;
  const save = useMutation({
    mutationFn: () => salaryService.setKpiPool(employeeId, amount),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });
  return (
    <Modal
      open
      size="sm"
      title="KPI bonus fondi"
      description={name}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={amount < 0} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Oylik maksimal KPI bonusi" htmlFor="kpi-pool" hint="Bonus = fond × vaznli bajarilish. Tasdiqlangan oylar o‘zgarmaydi.">
          <CurrencyInput id="kpi-pool" value={value} onValueChange={setValue} />
        </FormField>
      </div>
    </Modal>
  );
}

