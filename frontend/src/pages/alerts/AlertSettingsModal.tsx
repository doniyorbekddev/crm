import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert as Notice } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { alertsService } from '@/services/alerts.service';
import type { AlertNumericSetting, AlertSettings, AlertType } from '@/types/alert';
import { ALERT_TYPE_DESCRIPTIONS, ALERT_TYPE_LABELS, ALERT_TYPE_ORDER } from '@/utils/alertLabels';

interface NumberField {
  key: AlertNumericSetting;
  label: string;
  hint: string;
  suffix: string;
}

const THRESHOLD_FIELDS: readonly NumberField[] = [
  { key: 'debtSharePercent', label: 'Katta qarz', hint: 'shartnomaning kamida shu qismi to‘lanmagan', suffix: '%' },
  { key: 'debtGraceDays', label: 'Qarz uchun kutish', hint: 'o‘qish boshlanganidan keyin', suffix: 'kun' },
  { key: 'dropoutAbsences', label: 'Chiqib ketish xavfi', hint: 'ketma-ket sababsiz qoldirilgan darslar', suffix: 'ta' },
  { key: 'attendanceWarning', label: 'Past davomat', hint: 'shundan past — o‘rta muhimlik', suffix: '%' },
  { key: 'attendanceCritical', label: 'Juda past davomat', hint: 'shundan past — yuqori muhimlik', suffix: '%' },
  { key: 'followUpWarning', label: 'Kechikkan follow-up', hint: 'managerda kamida shuncha', suffix: 'ta' },
  { key: 'followUpCritical', label: 'Juda ko‘p kechikkan', hint: 'shundan ko‘p — yuqori muhimlik', suffix: 'ta' },
  { key: 'salaryGraceDays', label: 'Maosh kechikishi', hint: 'oy tugaganidan keyin', suffix: 'kun' },
  { key: 'capacityPercent', label: 'To‘lmagan guruh', hint: 'band o‘rinlar shundan kam', suffix: '%' },
  { key: 'conversionDropPoints', label: 'Konversiya tushishi', hint: 'o‘tgan oyning shu davriga nisbatan', suffix: 'punkt' },
  { key: 'dropoutIncreasePercent', label: 'Ketishlar o‘sishi', hint: 'o‘tgan oyning shu davriga nisbatan', suffix: '%' },
  { key: 'dropoutIncreaseMin', label: 'Ketganlar (kamida)', hint: 'oy boshidan ketgan o‘quvchilar', suffix: 'ta' },
  { key: 'expenseApprovalDays', label: 'Tasdiq kutish', hint: 'xarajat shuncha kundan ortiq kutsa', suffix: 'kun' },
  { key: 'documentExpiryDays', label: 'Hujjat muddati', hint: 'tugashidan shuncha kun oldin', suffix: 'kun' },
];

type FormValues = Record<AlertNumericSetting, string>;

function toForm(settings: AlertSettings): FormValues {
  return Object.fromEntries(
    [...THRESHOLD_FIELDS.map((field) => field.key), 'digestHour' as const].map((key) => [key, String(settings[key])]),
  ) as FormValues;
}

function SettingsForm({ settings, onClose }: { settings: AlertSettings; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(() => toForm(settings));
  const [rules, setRules] = useState<Record<AlertType, boolean>>(settings.rules);
  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      alertsService.updateSettings({
        ...(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])) as Record<AlertNumericSetting, number>),
        digestEnabled,
        rules,
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      onClose();
    },
    onError: (error) => {
      const fields = getFieldErrors(error);
      if (fields.length > 0) setErrors(Object.fromEntries(fields.map((field) => [field.field, field.message])));
      else toast.error(getErrorMessage(error));
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!/^\d{1,4}$/.test(value)) next[key] = 'Butun son kiriting';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };

  const setValue = (key: AlertNumericSetting, value: string) => setValues((current) => ({ ...current, [key]: value.replace(/\D/g, '') }));

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Qoidalar</h3>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {ALERT_TYPE_ORDER.map((type) => (
            <li key={type}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                <Checkbox className="mt-0.5" checked={rules[type]} onChange={(event) => setRules((current) => ({ ...current, [type]: event.target.checked }))} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{ALERT_TYPE_LABELS[type]}</span>
                  <span className="block text-xs text-fg-muted">{ALERT_TYPE_DESCRIPTIONS[type]}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-fg-muted">O‘chirilgan qoidaning ochiq ogohlantirishlari keyingi tekshiruvda avtomatik yopiladi.</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Chegaralar</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {THRESHOLD_FIELDS.map((field) => (
            <FormField key={field.key} label={`${field.label} (${field.suffix})`} htmlFor={`alert-${field.key}`} hint={field.hint} error={errors[field.key]}>
              <Input id={`alert-${field.key}`} inputMode="numeric" value={values[field.key]} onChange={(event) => setValue(field.key, event.target.value)} />
            </FormField>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox className="mt-0.5" checked={digestEnabled} onChange={(event) => setDigestEnabled(event.target.checked)} />
          <span>
            <span className="block text-sm font-medium text-fg">Kunlik xulosa</span>
            <span className="block text-xs text-fg-muted">
              Direktor paneliga ruxsati bor xodimlarga har kuni kechagi tushum, xarajat, o‘quvchilar, davomat, qarz va muhim ogohlantirishlar
              bildirishnoma sifatida yuboriladi
            </span>
          </span>
        </label>
        <FormField label="Yuborish soati" htmlFor="alert-digestHour" hint="o‘quv markaz vaqti bilan, 0–23" error={errors.digestHour}>
          <Input id="alert-digestHour" inputMode="numeric" disabled={!digestEnabled} value={values.digestHour} onChange={(event) => setValue('digestHour', event.target.value)} />
        </FormField>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
          Bekor qilish
        </Button>
        <Button loading={save.isPending} onClick={submit}>
          Saqlash
        </Button>
      </div>
    </div>
  );
}

/** Ogohlantirish qoidalari, chegaralari va kunlik xulosa — faqat alert.manage ruxsati bilan */
export function AlertSettingsModal({ onClose }: { onClose: () => void }) {
  const settingsQuery = useQuery({ queryKey: queryKeys.alerts.settings, queryFn: alertsService.settings });

  return (
    <Modal open size="lg" title="Ogohlantirish sozlamalari" description="Qaysi holatlar kuzatilishini va chegaralarni belgilang" onClose={onClose}>
      {settingsQuery.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : settingsQuery.isError ? (
        <Notice tone="error">{getErrorMessage(settingsQuery.error)}</Notice>
      ) : (
        <SettingsForm settings={settingsQuery.data} onClose={onClose} />
      )}
    </Modal>
  );
}
