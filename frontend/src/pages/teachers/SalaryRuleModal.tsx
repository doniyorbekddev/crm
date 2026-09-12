import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';
import type { SalaryType, TeacherItem } from '@/types/teacher';
import { formatDate } from '@/utils/format';
import { SALARY_TYPE_HINTS, SALARY_TYPE_LABELS, SALARY_TYPE_ORDER, salaryRuleSummary } from '@/utils/teacherLabels';

const amountField = (label: string) =>
  z
    .string()
    .refine((value) => value === '' || /^\d{1,9}$/.test(value), `${label} butun son bo‘lishi kerak`);

const schema = z.object({
  type: z.enum(SALARY_TYPE_ORDER),
  baseSalary: amountField('Asosiy maosh'),
  perLessonRate: amountField('Dars uchun to‘lov'),
  perStudentRate: amountField('O‘quvchi uchun to‘lov'),
  percentage: z.string().refine((value) => value === '' || (/^\d{1,3}([.,]\d{1,2})?$/.test(value) && Number(value.replace(',', '.')) <= 100), 'Foiz 0–100 oralig‘ida'),
  bonus: amountField('Bonus'),
  effectiveFrom: z.string().min(1, 'Sanani kiriting'),
  note: z.string().trim().max(255, 'Izoh juda uzun'),
});

type FormValues = z.infer<typeof schema>;

/** Modelga tegishli maydonlar — faqat ular ko‘rsatiladi */
const FIELDS_BY_TYPE: Record<SalaryType, ReadonlyArray<'baseSalary' | 'perLessonRate' | 'perStudentRate' | 'percentage'>> = {
  FIXED: ['baseSalary'],
  PER_LESSON: ['perLessonRate'],
  PER_STUDENT: ['perStudentRate'],
  PERCENTAGE: ['percentage'],
  MIXED: ['baseSalary', 'perLessonRate', 'perStudentRate', 'percentage'],
};

const FIELD_LABELS: Record<'baseSalary' | 'perLessonRate' | 'perStudentRate' | 'percentage', string> = {
  baseSalary: 'Asosiy maosh (so‘m)',
  perLessonRate: 'Bir dars uchun (so‘m)',
  perStudentRate: 'Bir o‘quvchi uchun (so‘m)',
  percentage: 'Tushumdan ulush (%)',
};

interface SalaryRuleModalProps {
  teacher: TeacherItem;
  onClose: () => void;
  onSaved: () => void;
}

export function SalaryRuleModal({ teacher, onClose, onSaved }: SalaryRuleModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: queryKeys.teachers.salaryRules(teacher.id),
    queryFn: () => teachersService.salaryRules(teacher.id),
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
      type: teacher.salaryRule?.type ?? ('PER_LESSON' as SalaryType),
      baseSalary: teacher.salaryRule?.baseSalary ? String(teacher.salaryRule.baseSalary) : '',
      perLessonRate: teacher.salaryRule?.perLessonRate ? String(teacher.salaryRule.perLessonRate) : '',
      perStudentRate: teacher.salaryRule?.perStudentRate ? String(teacher.salaryRule.perStudentRate) : '',
      percentage: teacher.salaryRule?.percentage ? String(teacher.salaryRule.percentage) : '',
      bonus: teacher.salaryRule?.bonus ? String(teacher.salaryRule.bonus) : '',
      effectiveFrom: new Date().toISOString().slice(0, 8) + '01',
      note: '',
    },
  });

  const type = useWatch({ control, name: 'type' });
  const visibleFields = FIELDS_BY_TYPE[type];

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      teachersService.createSalaryRule(teacher.id, {
        type: values.type,
        baseSalary: Number(values.baseSalary || 0),
        perLessonRate: Number(values.perLessonRate || 0),
        perStudentRate: Number(values.perStudentRate || 0),
        percentage: Number((values.percentage || '0').replace(',', '.')),
        bonus: Number(values.bonus || 0),
        effectiveFrom: values.effectiveFrom,
        ...(values.note ? { note: values.note } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['baseSalary', 'perLessonRate', 'perStudentRate', 'percentage', 'bonus', 'effectiveFrom'])) {
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
      title="Maosh modeli"
      description={`${teacher.user.firstName} ${teacher.user.lastName} — yangi model eskisini tarix uchun yopadi`}
      onClose={onClose}
      closeDisabled={save.isPending}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="salary-rule-form" loading={save.isPending}>
            Modelni saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form id="salary-rule-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Model turi" htmlFor="rule-type" error={errors.type?.message} required hint={SALARY_TYPE_HINTS[type]}>
          <Select
            id="rule-type"
            invalid={Boolean(errors.type)}
            aria-describedby={errors.type ? fieldErrorId('rule-type') : undefined}
            {...register('type')}
          >
            {SALARY_TYPE_ORDER.map((item) => (
              <option key={item} value={item}>
                {SALARY_TYPE_LABELS[item]}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          {visibleFields.map((field) => (
            <FormField key={field} label={FIELD_LABELS[field]} htmlFor={`rule-${field}`} error={errors[field]?.message} required>
              <Input id={`rule-${field}`} inputMode="decimal" invalid={Boolean(errors[field])} {...register(field)} />
            </FormField>
          ))}
          <FormField label="Oylik bonus (so‘m)" htmlFor="rule-bonus" error={errors.bonus?.message} hint="Har oy avtomatik qo‘shiladi">
            <Input id="rule-bonus" inputMode="numeric" {...register('bonus')} />
          </FormField>
          <FormField
            label="Kuchga kirish sanasi"
            htmlFor="rule-effectiveFrom"
            error={errors.effectiveFrom?.message}
            required
            hint="Shu sanadan keyingi oylar yangi model bo‘yicha hisoblanadi"
          >
            <Input id="rule-effectiveFrom" type="date" {...register('effectiveFrom')} />
          </FormField>
        </div>

        <FormField label="Izoh" htmlFor="rule-note" error={errors.note?.message} hint="Ixtiyoriy — nima uchun o‘zgardi">
          <Input id="rule-note" placeholder="Yuklama oshdi" {...register('note')} />
        </FormField>
      </form>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-fg">Model tarixi</p>
        {rulesQuery.isPending ? (
          <p className="text-sm text-fg-muted">Yuklanmoqda…</p>
        ) : rulesQuery.isError ? (
          <Alert tone="error">{getErrorMessage(rulesQuery.error)}</Alert>
        ) : rulesQuery.data.length === 0 ? (
          <p className="text-sm text-fg-muted">Hozircha maosh modeli belgilanmagan</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rulesQuery.data.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-fg">
                    {SALARY_TYPE_LABELS[rule.type]}
                    {rule.isActive && <Badge tone="green">Amalda</Badge>}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {formatDate(rule.effectiveFrom)} – {rule.effectiveTo ? formatDate(rule.effectiveTo) : 'hozirgacha'}
                    {rule.note && ` · ${rule.note}`}
                  </p>
                </div>
                <p className="text-xs text-fg-muted">{salaryRuleSummary(rule)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
