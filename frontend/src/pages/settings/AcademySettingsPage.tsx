import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Save, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { academySettingsService, brandingAssetUrl } from '@/services/academySettings.service';
import type { AcademySettings, AcademySettingsPayload, Weekday, WorkingDay } from '@/types/settings';
import { formatDateTime } from '@/utils/format';

const DAY_LABELS: Record<Weekday, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

/** Ko'rsatish uchun tanlanadigan mintaqalar (hisob-kitoblar server sozlamasi bo'yicha — pastdagi izohga qarang) */
const TIMEZONES = ['Asia/Tashkent', 'Asia/Samarkand', 'Asia/Almaty', 'Asia/Dushanbe', 'Asia/Bishkek', 'Europe/Moscow', 'UTC'];

interface Draft {
  name: string;
  phone: string;
  email: string;
  address: string;
  workingHours: WorkingDay[];
  academicStart: string;
  academicEnd: string;
  timezone: string;
}

function toDraft(settings: AcademySettings): Draft {
  return {
    name: settings.name,
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    address: settings.address ?? '',
    workingHours: settings.workingHours,
    academicStart: settings.academicYear.start,
    academicEnd: settings.academicYear.end,
    timezone: settings.timezone,
  };
}

/** Brauzerda tezkor tekshiruv — yakuniy tekshiruv serverda (bir xil qoidalar) */
export function validateDraft(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim().length < 2) errors.name = 'Nom kamida 2 belgi';
  if (draft.name.trim().length > 120) errors.name = 'Nom 120 belgidan oshmasin';
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = 'Email noto‘g‘ri formatda';
  draft.workingHours.forEach((row, index) => {
    if (row.isOpen && row.from >= row.to) errors[`workingHours.${index}.to`] = 'Tugash vaqti boshlanishdan keyin bo‘lsin';
  });
  if (!draft.academicStart || !draft.academicEnd || draft.academicStart >= draft.academicEnd) {
    errors['academicYear.end'] = 'O‘quv yili tugashi boshlanishidan keyin bo‘lsin';
  }
  return errors;
}

function toPayload(draft: Draft): AcademySettingsPayload {
  return {
    name: draft.name.trim(),
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
    ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
    ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
    workingHours: draft.workingHours,
    currency: 'UZS',
    academicYear: { start: draft.academicStart, end: draft.academicEnd },
    timezone: draft.timezone,
    defaultLanguage: 'uz',
  };
}

function LogoCard({ settings }: { settings: AcademySettings }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const onDone = (result: { data: AcademySettings; message: string }) => {
    queryClient.setQueryData(queryKeys.settings.academy, result.data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.settings.branding });
    toast.success(result.message);
  };
  const upload = useMutation({ mutationFn: (file: File) => academySettingsService.uploadLogo(file), onSuccess: onDone, onError: (error) => toast.error(getErrorMessage(error)) });
  const remove = useMutation({ mutationFn: () => academySettingsService.removeLogo(), onSuccess: onDone, onError: (error) => toast.error(getErrorMessage(error)) });
  const logo = brandingAssetUrl(settings.logoUrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>PNG, JPG yoki WEBP, 2 MB gacha. Kirish sahifasi va menyuda ko‘rinadi.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 place-items-center overflow-hidden rounded-xl border border-border bg-surface-muted">
          {logo ? <img src={logo} alt="Joriy logo" className="size-full object-contain" /> : <span className="text-xs text-fg-subtle">Logo yo‘q</span>}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Logo fayli"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
        <Button variant="secondary" leftIcon={<ImageUp className="size-4" aria-hidden />} loading={upload.isPending} onClick={() => input.current?.click()}>
          {logo ? 'Almashtirish' : 'Yuklash'}
        </Button>
        {logo && (
          <Button variant="ghost" leftIcon={<Trash2 className="size-4" aria-hidden />} loading={remove.isPending} onClick={() => remove.mutate()}>
            O‘chirish
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** TZ 3.1 GAP-01 — umumiy "Markaz ma'lumotlari" (faqat `settings.manage`: rahbar va super admin) */
export default function AcademySettingsPage() {
  const query = useQuery({ queryKey: queryKeys.settings.academy, queryFn: () => academySettingsService.get() });
  const header = <PageHeader title="Markaz ma’lumotlari" description="Nom, aloqa, ish vaqti va o‘quv yili — butun tizim uchun" />;
  if (!query.data) {
    return (
      <>
        {header}
        {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <Skeleton className="h-96 w-full" />}
      </>
    );
  }
  // Saqlangach (updatedAt o'zgaradi) forma serverdagi normallashtirilgan qiymatlar bilan qayta ochiladi
  return (
    <>
      {header}
      <SettingsForm key={query.data.updatedAt ?? 'new'} settings={query.data} />
    </>
  );
}

function SettingsForm({ settings }: { settings: AcademySettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (payload: AcademySettingsPayload) => academySettingsService.save(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.settings.academy, result.data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.branding });
      toast.success(result.message);
    },
    onError: (error) => {
      const fields = Object.fromEntries(getFieldErrors(error).flatMap((detail) => (detail.field ? [[detail.field, detail.message]] : [])));
      setErrors(fields);
      if (Object.keys(fields).length === 0) toast.error(getErrorMessage(error));
    },
  });

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const patchDay = (index: number, next: Partial<WorkingDay>) =>
    patch({ workingHours: draft.workingHours.map((row, position) => (position === index ? { ...row, ...next } : row)) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate(toPayload(draft));
  };

  return (
    <>
      {!settings.configured && (
        <Alert tone="info" className="mb-4">
          Hali saqlanmagan — standart qiymatlar ko‘rsatilmoqda.
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <form className="space-y-4 lg:col-span-2" onSubmit={submit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Asosiy</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Markaz nomi" htmlFor="academy-name" error={errors.name} required>
                  <Input id="academy-name" value={draft.name} maxLength={120} invalid={Boolean(errors.name)} onChange={(event) => patch({ name: event.target.value })} />
                </FormField>
              </div>
              <FormField label="Telefon" htmlFor="academy-phone" error={errors.phone}>
                <Input id="academy-phone" inputMode="tel" placeholder="+998 90 123 45 67" value={draft.phone} invalid={Boolean(errors.phone)} onChange={(event) => patch({ phone: event.target.value })} />
              </FormField>
              <FormField label="Email" htmlFor="academy-email" error={errors.email}>
                <Input id="academy-email" type="email" value={draft.email} invalid={Boolean(errors.email)} onChange={(event) => patch({ email: event.target.value })} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Manzil" htmlFor="academy-address" error={errors.address}>
                  <Input id="academy-address" value={draft.address} maxLength={255} onChange={(event) => patch({ address: event.target.value })} />
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ish vaqti</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {draft.workingHours.map((row, index) => {
                  const error = errors[`workingHours.${index}.to`] ?? errors[`workingHours.${index}.from`];
                  return (
                    <li key={row.day} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="w-28 text-sm font-medium text-fg">{DAY_LABELS[row.day]}</span>
                      <Checkbox label="Ochiq" checked={row.isOpen} onChange={(event) => patchDay(index, { isOpen: event.target.checked })} />
                      <Input type="time" aria-label={`${DAY_LABELS[row.day]} — ochilish`} className="h-9 w-28" disabled={!row.isOpen} value={row.from} onChange={(event) => patchDay(index, { from: event.target.value })} />
                      <span className="text-fg-muted">—</span>
                      <Input
                        type="time"
                        aria-label={`${DAY_LABELS[row.day]} — yopilish`}
                        className="h-9 w-28"
                        disabled={!row.isOpen}
                        invalid={Boolean(error)}
                        value={row.to}
                        onChange={(event) => patchDay(index, { to: event.target.value })}
                      />
                      {error && (
                        <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>O‘quv yili va hudud</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label="O‘quv yili boshlanishi" htmlFor="academy-year-start" required>
                <Input id="academy-year-start" type="date" value={draft.academicStart} onChange={(event) => patch({ academicStart: event.target.value })} />
              </FormField>
              <FormField label="O‘quv yili tugashi" htmlFor="academy-year-end" error={errors['academicYear.end']} required>
                <Input id="academy-year-end" type="date" invalid={Boolean(errors['academicYear.end'])} value={draft.academicEnd} onChange={(event) => patch({ academicEnd: event.target.value })} />
              </FormField>
              <FormField label="Vaqt mintaqasi" htmlFor="academy-timezone" hint="Ko‘rsatish uchun. Hisobotlar server sozlamasi (APP_UTC_OFFSET_MINUTES) bo‘yicha hisoblanadi." error={errors.timezone}>
                <Select id="academy-timezone" value={draft.timezone} onChange={(event) => patch({ timezone: event.target.value })}>
                  {(TIMEZONES.includes(draft.timezone) ? TIMEZONES : [draft.timezone, ...TIMEZONES]).map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Valyuta" htmlFor="academy-currency" hint="Summalar va to‘lov qoidalari so‘mda — boshqa valyuta hozircha qo‘llanmaydi.">
                <Select id="academy-currency" value="UZS" disabled>
                  <option value="UZS">UZS — so‘m</option>
                </Select>
              </FormField>
              <FormField label="Standart til" htmlFor="academy-language" hint="Interfeys hozircha faqat o‘zbek tilida.">
                <Select id="academy-language" value="uz" disabled>
                  <option value="uz">O‘zbekcha</option>
                </Select>
              </FormField>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {settings.updatedAt && (
              <span className="text-xs text-fg-muted">
                Oxirgi o‘zgarish: {formatDateTime(settings.updatedAt)}
                {settings.updatedBy ? ` · ${settings.updatedBy.firstName} ${settings.updatedBy.lastName}` : ''}
              </span>
            )}
            <Button type="submit" leftIcon={<Save className="size-4" aria-hidden />} loading={save.isPending}>
              Saqlash
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <LogoCard settings={settings} />
        </div>
      </div>
    </>
  );
}
