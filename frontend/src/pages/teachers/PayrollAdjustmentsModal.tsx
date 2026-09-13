import { useMutation } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { cn } from '@/lib/cn';
import { salaryService } from '@/services/salary.service';
import type { PayrollAdjustment, PayrollAdjustmentCategory, PayrollAdjustmentType, SalaryPeriod } from '@/types/teacher';
import { formatDate, formatMoney } from '@/utils/format';
import {
  ADJUSTMENT_CATEGORY_LABELS,
  ADJUSTMENT_TYPE_LABELS,
  BONUS_CATEGORY_ORDER,
  PENALTY_CATEGORY_ORDER,
} from '@/utils/teacherLabels';

interface PayrollAdjustmentsModalProps {
  period: SalaryPeriod;
  /** salary.calculate ruxsati — qo‘shish va bekor qilish */
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** Oy ichidagi sana: bugun shu oyda bo‘lsa — bugun, aks holda oyning 1-kuni */
function defaultDate(period: SalaryPeriod): string {
  const today = new Date();
  if (today.getFullYear() === period.year && today.getMonth() + 1 === period.month) {
    return `${period.year}-${String(period.month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  return `${period.year}-${String(period.month).padStart(2, '0')}-01`;
}

const personName = (person: { firstName: string; lastName: string } | null) =>
  person ? `${person.firstName} ${person.lastName}` : null;

export function PayrollAdjustmentsModal({ period, canEdit, onClose, onChanged }: PayrollAdjustmentsModalProps) {
  const [current, setCurrent] = useState(period);
  const [type, setType] = useState<PayrollAdjustmentType>('BONUS');
  const [category, setCategory] = useState<PayrollAdjustmentCategory>('PERFORMANCE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => defaultDate(period));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);

  const editable = canEdit && current.lockedAt === null;
  const accrued = current.baseAmount + current.lessonAmount + current.studentAmount + current.percentageAmount;
  const active = current.adjustments.filter((row) => row.voidedAt === null);
  const extraBonus = active.filter((row) => row.type === 'BONUS').reduce((sum, row) => sum + row.amount, 0);
  const categories = type === 'BONUS' ? BONUS_CATEGORY_ORDER : PENALTY_CATEGORY_ORDER;

  const applyResult = (result: { data: SalaryPeriod; message?: string }) => {
    setCurrent(result.data);
    toast.success(result.message ?? 'Saqlandi');
    onChanged();
  };

  const add = useMutation({
    mutationFn: () =>
      salaryService.addAdjustment({
        teacherProfileId: current.teacher.profileId,
        year: current.year,
        month: current.month,
        type,
        category,
        amount: Number(amount),
        reason: reason.trim(),
        date,
      }),
    onSuccess: (result) => {
      applyResult(result);
      setAmount('');
      setReason('');
      setErrors({});
    },
    onError: (error) => {
      const fields = getFieldErrors(error);
      if (fields.length > 0) {
        setErrors(Object.fromEntries(fields.map((field) => [field.field, field.message])));
      } else {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) => salaryService.voidAdjustment(input.id, input.reason),
    onSuccess: (result) => {
      applyResult(result);
      setVoiding(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!/^\d{4,9}$/.test(amount) || Number(amount) < 1000) next.amount = 'Eng kam summa — 1 000 so‘m';
    if (reason.trim().length < 3) next.reason = 'Sabab kamida 3 belgidan iborat bo‘lsin';
    if (!date) next.date = 'Sanani tanlang';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) add.mutate();
  };

  const changeType = (value: PayrollAdjustmentType) => {
    setType(value);
    setCategory(value === 'BONUS' ? 'PERFORMANCE' : 'LATENESS');
  };

  return (
    <Modal
      open
      size="lg"
      title="Bonus va jarimalar"
      description={`${current.teacher.firstName} ${current.teacher.lastName} · ${current.label}`}
      onClose={onClose}
      closeDisabled={add.isPending || voidMutation.isPending}
    >
      <div className="space-y-5">
        <div className="grid gap-x-6 gap-y-1 rounded-xl border border-border bg-surface-muted p-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between">
            <span className="text-fg-muted">Hisoblangan</span>
            <span className="font-medium text-fg tabular-nums">{formatMoney(accrued)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Model bonusi</span>
            <span className="text-fg tabular-nums">{formatMoney(current.modelBonus)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Qo‘shimcha bonus</span>
            <span className="text-emerald-600 tabular-nums dark:text-emerald-400">+{formatMoney(extraBonus)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Jarimalar</span>
            <span className="text-red-600 tabular-nums dark:text-red-400">−{formatMoney(current.penalty)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 sm:col-span-2">
            <span className="font-medium text-fg">Jami maosh</span>
            <span className="font-semibold text-fg tabular-nums">{formatMoney(current.totalAmount)}</span>
          </div>
        </div>

        {current.lockedAt && (
          <Alert tone="info">Maosh tasdiqlangan — yozuvlar qotirilgan. O‘zgartirish uchun maosh qayta ochilishi kerak.</Alert>
        )}

        {editable && (
          <section className="space-y-3 rounded-xl border border-border p-3">
            {formError && <Alert tone="error">{formError}</Alert>}
            <div role="group" aria-label="Turi" className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
              {(['BONUS', 'PENALTY'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => changeType(value)}
                  className={cn(
                    'h-8 rounded-md px-4 text-sm font-medium text-fg-muted transition-colors',
                    type === value && 'bg-surface text-fg shadow-sm',
                  )}
                >
                  {ADJUSTMENT_TYPE_LABELS[value]}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Toifa" htmlFor="adjustment-category" error={errors.category} required>
                <Select
                  id="adjustment-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as PayrollAdjustmentCategory)}
                >
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {ADJUSTMENT_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Summa (so‘m)" htmlFor="adjustment-amount" error={errors.amount} required>
                <Input
                  id="adjustment-amount"
                  inputMode="numeric"
                  value={amount}
                  invalid={Boolean(errors.amount)}
                  onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
                />
              </FormField>
              <FormField label="Sana" htmlFor="adjustment-date" error={errors.date} required>
                <Input id="adjustment-date" type="date" value={date} invalid={Boolean(errors.date)} onChange={(event) => setDate(event.target.value)} />
              </FormField>
            </div>
            <FormField label="Sabab" htmlFor="adjustment-reason" error={errors.reason} required>
              <Input
                id="adjustment-reason"
                value={reason}
                invalid={Boolean(errors.reason)}
                placeholder={type === 'BONUS' ? 'Imtihon natijalari yuqori' : 'Darsga 20 daqiqa kechikdi'}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
            <div className="flex justify-end">
              <Button onClick={submit} loading={add.isPending}>
                {type === 'BONUS' ? 'Bonus qo‘shish' : 'Jarima qo‘shish'}
              </Button>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">Yozuvlar</h3>
          {current.adjustments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-fg-muted">Bu oyda bonus yoki jarima yo‘q</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {current.adjustments.map((row: PayrollAdjustment) => (
                <li key={row.id} className={cn('space-y-2 px-3 py-2.5 text-sm', row.voidedAt && 'opacity-60')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={row.type === 'BONUS' ? 'green' : 'red'}>{ADJUSTMENT_TYPE_LABELS[row.type]}</Badge>
                        <span className="font-medium text-fg">{ADJUSTMENT_CATEGORY_LABELS[row.category]}</span>
                        <span className="text-xs text-fg-muted">{formatDate(row.date)}</span>
                        {row.voidedAt && <Badge tone="gray">Bekor qilingan</Badge>}
                      </p>
                      <p className={cn('mt-1 text-fg', row.voidedAt && 'line-through')}>{row.reason}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        Kiritdi: {personName(row.createdBy) ?? '—'} ·{' '}
                        {row.approvedBy ? `tasdiqladi: ${personName(row.approvedBy)}` : 'maosh bilan tasdiqlanadi'}
                      </p>
                      {row.voidedAt && (
                        <p className="mt-0.5 text-xs text-fg-muted">
                          Bekor qildi: {personName(row.voidedBy) ?? '—'} — {row.voidReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'font-semibold whitespace-nowrap tabular-nums',
                          row.type === 'BONUS' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {row.type === 'BONUS' ? '+' : '−'}
                        {formatMoney(row.amount)}
                      </span>
                      {editable && !row.voidedAt && voiding?.id !== row.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${ADJUSTMENT_CATEGORY_LABELS[row.category]} yozuvini bekor qilish`}
                          leftIcon={<Ban className="size-4" aria-hidden />}
                          onClick={() => setVoiding({ id: row.id, reason: '' })}
                        >
                          Bekor
                        </Button>
                      )}
                    </div>
                  </div>
                  {voiding?.id === row.id && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        autoFocus
                        aria-label="Bekor qilish sababi"
                        placeholder="Bekor qilish sababi"
                        value={voiding.reason}
                        onChange={(event) => setVoiding({ id: row.id, reason: event.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setVoiding(null)} disabled={voidMutation.isPending}>
                          Yopish
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={voidMutation.isPending}
                          disabled={voiding.reason.trim().length < 3}
                          onClick={() => voidMutation.mutate(voiding)}
                        >
                          Bekor qilish
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
