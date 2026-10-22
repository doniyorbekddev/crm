import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QrCode } from '@/components/QrCode';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { authService } from '@/services/auth.service';
import { formatDateTime } from '@/utils/format';

type Step = { kind: 'idle' } | { kind: 'password' } | { kind: 'scan'; secret: string; otpauthUrl: string } | { kind: 'codes'; codes: string[] } | { kind: 'confirm'; action: 'disable' | 'regenerate' };

/**
 * Ikki bosqichli kirish (TOTP): Google Authenticator, Microsoft Authenticator va shu kabi ilovalar bilan.
 * Yoqilgach kirishda paroldan keyin 6 xonali kod so'raladi. Rahbar va adminlarga tavsiya etiladi.
 */
export function TwoFactorCard() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: queryKeys.auth.twoFactor, queryFn: () => authService.twoFactorStatus() });
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = (next: Step = { kind: 'idle' }) => {
    setStep(next);
    setPassword('');
    setCode('');
    setError(null);
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.twoFactor });
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
  };
  const onError = (mutationError: unknown) => setError(getErrorMessage(mutationError));

  const setup = useMutation({ mutationFn: () => authService.twoFactorSetup(password), onSuccess: (data) => reset({ kind: 'scan', ...data }), onError });
  const enable = useMutation({
    mutationFn: () => authService.twoFactorEnable(code),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      reset({ kind: 'codes', codes: result.data.recoveryCodes });
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: () => authService.twoFactorDisable({ password, code }),
    onSuccess: (message) => {
      toast.success(message);
      refresh();
      reset();
    },
    onError,
  });
  const regenerate = useMutation({
    mutationFn: () => authService.twoFactorRecoveryCodes({ password, code }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      reset({ kind: 'codes', codes: result.data.recoveryCodes });
    },
    onError,
  });

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <ShieldCheck className="size-4" aria-hidden />
        Ikki bosqichli kirish
        {status.data?.enabled && <Badge tone="green">Yoqilgan</Badge>}
      </CardTitle>
      <CardDescription>Parol o‘g‘irlansa ham hisobingizga kirib bo‘lmaydi: kirishda telefondagi ilova kodi so‘raladi.</CardDescription>
    </CardHeader>
  );

  if (status.isPending) {
    return (
      <Card>
        {header}
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (status.isError) {
    return (
      <Card>
        {header}
        <CardContent>
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        </CardContent>
      </Card>
    );
  }
  const data = status.data;

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {step.kind === 'codes' && <RecoveryCodes codes={step.codes} onDone={() => reset()} />}

        {step.kind === 'idle' &&
          (data.enabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body text-fg-muted">
                {data.enabledAt ? `Yoqilgan: ${formatDateTime(data.enabledAt)} · ` : ''}Tiklash kodlari qoldi: {data.recoveryCodesLeft}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => reset({ kind: 'confirm', action: 'regenerate' })}>
                  Yangi tiklash kodlari
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<ShieldOff className="size-4" aria-hidden />} onClick={() => reset({ kind: 'confirm', action: 'disable' })}>
                  O‘chirish
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body text-fg-muted">Yoqilmagan. Kerak bo‘ladi: telefonda Google Authenticator yoki shunga o‘xshash ilova.</p>
              <Button onClick={() => reset({ kind: 'password' })}>Yoqish</Button>
            </div>
          ))}

        {step.kind === 'password' && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (password && !setup.isPending) setup.mutate();
            }}
          >
            <FormField label="Joriy parol" htmlFor="tfa-password" hint="Hisob egasi ekaningizni tasdiqlash uchun">
              <PasswordInput id="tfa-password" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => reset()}>
                Bekor qilish
              </Button>
              <Button type="submit" loading={setup.isPending} disabled={!password}>
                Davom etish
              </Button>
            </div>
          </form>
        )}

        {step.kind === 'scan' && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{6}$/.test(code) && !enable.isPending) enable.mutate();
            }}
          >
            <ol className="list-decimal space-y-1 pl-5 text-body text-fg-muted">
              <li>Ilovada “Hisob qo‘shish” → “QR kodni skanerlash”.</li>
              <li>Ilova ko‘rsatgan 6 xonali kodni pastga kiriting.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              <QrCode value={step.otpauthUrl} size={176} className="rounded-control border-4 border-white" />
              <div className="min-w-0 space-y-1">
                <p className="text-caption text-fg-muted">Skanerlab bo‘lmasa, kalitni qo‘lda kiriting:</p>
                <code className="block break-all rounded-control bg-surface-muted px-2 py-1 font-mono text-caption text-fg">{step.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              </div>
            </div>
            <FormField label="Ilovadagi kod" htmlFor="tfa-code">
              <Input id="tfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => reset()}>
                Bekor qilish
              </Button>
              <Button type="submit" loading={enable.isPending} disabled={!/^\d{6}$/.test(code)}>
                Tasdiqlash va yoqish
              </Button>
            </div>
          </form>
        )}

        {step.kind === 'confirm' && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const mutation = step.action === 'disable' ? disable : regenerate;
              if (password && code && !mutation.isPending) mutation.mutate();
            }}
          >
            {step.action === 'disable' && <Alert tone="warning">O‘chirilsa, hisobingiz yana faqat parol bilan himoyalanadi.</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Joriy parol" htmlFor="tfa-confirm-password">
                <PasswordInput id="tfa-confirm-password" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
              </FormField>
              <FormField label="Ilovadagi kod yoki tiklash kodi" htmlFor="tfa-confirm-code">
                <Input id="tfa-confirm-code" autoComplete="one-time-code" maxLength={20} value={code} onChange={(event) => setCode(event.target.value)} />
              </FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => reset()}>
                Bekor qilish
              </Button>
              <Button
                type="submit"
                variant={step.action === 'disable' ? 'danger' : 'primary'}
                loading={disable.isPending || regenerate.isPending}
                disabled={!password || code.trim().length < 6}
              >
                {step.action === 'disable' ? 'O‘chirish' : 'Yangi kodlar yaratish'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** Tiklash kodlari faqat bir marta ko'rsatiladi — nusxa olish yoki fayl qilib saqlash */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Nusxa olindi');
    } catch {
      toast.error('Nusxa olib bo‘lmadi — kodlarni qo‘lda yozib oling');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`CRM — 2FA tiklash kodlari\nHar biri bir marta ishlaydi.\n\n${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crm-2fa-tiklash-kodlari.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <Alert tone="warning" title="Tiklash kodlarini hozir saqlang">
        Telefon yo‘qolsa, shu kodlardan biri bilan kirasiz. Har biri bir marta ishlaydi va boshqa ko‘rsatilmaydi.
      </Alert>
      <ul aria-label="Tiklash kodlari" className="grid grid-cols-2 gap-2 rounded-control bg-surface-muted p-3 font-mono text-body text-fg sm:grid-cols-5">
        {codes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Copy className="size-4" aria-hidden />} onClick={() => void copy()}>
          Nusxa olish
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Download className="size-4" aria-hidden />} onClick={download}>
          Fayl qilib saqlash
        </Button>
        <Button size="sm" onClick={onDone}>
          Saqladim
        </Button>
      </div>
    </div>
  );
}
