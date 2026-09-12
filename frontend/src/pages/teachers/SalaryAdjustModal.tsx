import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { salaryService } from '@/services/salary.service';
import type { SalaryPeriod } from '@/types/teacher';
import { formatMoney } from '@/utils/format';

const amountField = (label: string) =>
  z.string().refine((value) => value === '' || /^\d{1,9}$/.test(value), `${label} butun son bo‘lishi kerak`);

const schema = z.object({
  bonus: amountField('Bonus'),
  penalty: amountField('Jarima'),
  note: z.string().trim().max(255, 'Izoh juda uzun'),
});

type FormValues = z.infer<typeof schema>;

interface SalaryAdjustModalProps {
  period: SalaryPeriod;
  onClose: () => void;
  onSaved: () => void;
}

export function SalaryAdjustModal({ period, onClose, onSaved }: SalaryAdjustModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const accrued = period.baseAmount + period.lessonAmount + period.studentAmount + period.percentageAmount;

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      bonus: period.bonus ? String(period.bonus) : '',
      penalty: period.penalty ? String(period.penalty) : '',
      note: period.note ?? '',
    },
  });

  const bonus = Number(useWatch({ control, name: 'bonus' }) || 0);
  const penalty = Number(useWatch({ control, name: 'penalty' }) || 0);
  const total = Math.max(accrued + bonus - penalty, 0);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      salaryService.adjust(period.id, {
        bonus: Number(values.bonus || 0),
        penalty: Number(values.penalty || 0),
        note: values.note,
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['bonus', 'penalty', 'note'])) {
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
      title="Bonus va jarima"
      description={`${period.teacher.firstName} ${period.teacher.lastName} · ${period.label}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="salary-adjust-form" loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form id="salary-adjust-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Hisoblangan (model bo‘yicha)</span>
            <span className="font-medium text-fg">{formatMoney(accrued)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-fg-muted">Bonus va jarimadan keyin</span>
            <span className="font-semibold text-fg">{formatMoney(total)}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Bonus (so‘m)" htmlFor="adjust-bonus" error={errors.bonus?.message}>
            <Input id="adjust-bonus" autoFocus inputMode="numeric" invalid={Boolean(errors.bonus)} {...register('bonus')} />
          </FormField>
          <FormField label="Jarima (so‘m)" htmlFor="adjust-penalty" error={errors.penalty?.message}>
            <Input id="adjust-penalty" inputMode="numeric" invalid={Boolean(errors.penalty)} {...register('penalty')} />
          </FormField>
        </div>

        <FormField
          label="Izoh"
          htmlFor="adjust-note"
          error={errors.note?.message}
          hint="Bonus yoki jarima sababi — maosh tarixida saqlanadi"
        >
          <Input id="adjust-note" placeholder="Ochiq dars uchun bonus" {...register('note')} />
        </FormField>

        <Alert tone="info">Qayta hisoblashda bu qiymatlar saqlanadi — model bo‘yicha faqat dars, o‘quvchi va tushum qismlari yangilanadi.</Alert>
      </form>
    </Modal>
  );
}
