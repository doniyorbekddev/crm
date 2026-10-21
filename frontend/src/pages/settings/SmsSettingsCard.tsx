import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Save, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { smsSettingsService } from '@/services/smsSettings.service';
import type { SmsRecipients, SmsSettings } from '@/types/settings';
import { formatMoney } from '@/utils/format';

/**
 * SMS zaxira kanali (Eskiz.uz): Telegram ulanmagan ota-onaga muhim xabarlar SMS bo'lib boradi.
 * Eskiz kalitlari faqat serverda (.env.production) — bu yerda faqat holat, turlar va kunlik limit.
 */
export function SmsSettingsCard() {
  const query = useQuery({ queryKey: queryKeys.settings.sms, queryFn: () => smsSettingsService.get() });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4" aria-hidden />
          SMS (Eskiz)
        </CardTitle>
        <CardDescription>Telegram ulanmagan ota-onaga muhim xabarlar SMS bo‘lib boradi. Telegrami borlarga SMS ketmaydi.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <SmsForm key={query.data.updatedAt ?? 'new'} settings={query.data} />
        )}
      </CardContent>
    </Card>
  );
}

function SmsForm({ settings }: { settings: SmsSettings }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [types, setTypes] = useState<string[]>(settings.types);
  const [recipients, setRecipients] = useState<SmsRecipients>(settings.recipients);
  const [dailyLimit, setDailyLimit] = useState(String(settings.dailyLimit));
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Bu Eskiz dan test');

  const balance = useQuery({ queryKey: queryKeys.settings.smsBalance, queryFn: () => smsSettingsService.balance(), enabled: settings.configured, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: () => smsSettingsService.save({ enabled, types, recipients, dailyLimit: Number(dailyLimit) }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.settings.sms, result.data);
      toast.success(result.message);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const test = useMutation({
    mutationFn: () => smsSettingsService.test(testPhone, testMessage),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.smsBalance });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const limitValid = /^\d+$/.test(dailyLimit) && Number(dailyLimit) >= 1 && Number(dailyLimit) <= 5000;
  const toggleType = (type: string, checked: boolean) => setTypes((prev) => (checked ? [...prev, type] : prev.filter((item) => item !== type)));

  if (!settings.configured) {
    return (
      <Alert tone="info" title="Eskiz ulanmagan">
        SMS yoqish uchun Eskiz.uz kabinetidagi email va parol serverga (ESKIZ_EMAIL, ESKIZ_PASSWORD) kiritilishi kerak. Kalitlar CRM sahifasida saqlanmaydi va ko‘rsatilmaydi.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="green">Ulangan · jo‘natuvchi {settings.sender}</Badge>
        <Badge>Balans: {balance.data === undefined ? '…' : balance.data === null ? '—' : formatMoney(balance.data)}</Badge>
        <Badge>Bugun yuborildi: {settings.today.sent}</Badge>
        {settings.today.pending > 0 && <Badge tone="blue">Navbatda: {settings.today.pending}</Badge>}
        {settings.today.failed > 0 && <Badge tone="red">Xato: {settings.today.failed}</Badge>}
        {settings.today.skipped > 0 && <Badge tone="yellow">O‘tkazib yuborildi: {settings.today.skipped}</Badge>}
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (limitValid && !save.isPending) save.mutate();
        }}
      >
        <Checkbox label="SMS zaxira kanali yoqilgan" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />

        <fieldset className="space-y-2" disabled={!enabled}>
          <legend className="mb-1 text-label font-medium text-fg">Qaysi xabarlar SMS bo‘lib ketsin</legend>
          {settings.availableTypes.map((item) => (
            <div key={item.type}>
              <Checkbox label={item.label} checked={types.includes(item.type)} onChange={(event) => toggleType(item.type, event.target.checked)} />
              <p className="ml-6 text-caption text-fg-subtle">Masalan: {item.example}</p>
            </div>
          ))}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Kimga" htmlFor="sms-recipients">
            <Select id="sms-recipients" value={recipients} disabled={!enabled} onChange={(event) => setRecipients(event.target.value as SmsRecipients)}>
              <option value="PARENTS">Faqat ota-onalarga</option>
              <option value="PARENTS_AND_STUDENTS">Ota-ona va o‘quvchilarga</option>
            </Select>
          </FormField>
          <FormField label="Kunlik limit" htmlFor="sms-limit" hint="Xarajat himoyasi: 1–5000" {...(limitValid ? {} : { error: '1 dan 5000 gacha butun son' })}>
            <Input id="sms-limit" inputMode="numeric" value={dailyLimit} disabled={!enabled} onChange={(event) => setDailyLimit(event.target.value)} />
          </FormField>
        </div>

        <Alert tone="warning">
          Eskiz talabi: har bir SMS matni Eskiz kabinetida shablon sifatida moderatsiyadan o‘tgan bo‘lishi kerak — yuqoridagi namunalarni shablon qilib yuboring. Tasdiqlanmagan matn rad etiladi va “Xato” bo‘lib ko‘rinadi. SMS 21:00–08:00 oralig‘ida yuborilmaydi (ertalabga suriladi).
        </Alert>

        <div className="flex justify-end">
          <Button type="submit" leftIcon={<Save className="size-4" aria-hidden />} loading={save.isPending} disabled={!limitValid}>
            Saqlash
          </Button>
        </div>
      </form>

      <form
        className="space-y-2 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!test.isPending) test.mutate();
        }}
      >
        <p className="text-label font-medium text-fg">Sinov SMS</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Sinov telefon raqami" placeholder="+998 90 123 45 67" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} />
          <Input aria-label="Sinov matni" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} />
        </div>
        <p className="text-caption text-fg-subtle">Eskiz sinov rejimida faqat “Bu Eskiz dan test” matni o‘tadi.</p>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" leftIcon={<Send className="size-4" aria-hidden />} loading={test.isPending} disabled={testPhone.trim().length < 9 || testMessage.trim().length === 0}>
            Yuborish
          </Button>
        </div>
      </form>
    </div>
  );
}
