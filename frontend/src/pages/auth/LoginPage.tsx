import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Lock, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { loginIdentifierField } from '@/lib/validation';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import type { AuthSession } from '@/types/auth';
import { safeRedirectPath } from '@/utils/url';

const loginSchema = z.object({
  email: loginIdentifierField,
  password: z.string().min(1, 'Parolni kiriting'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  /** 2FA: parol to'g'ri — endi ilovadagi kod kutilmoqda */
  const [challenge, setChallenge] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signedIn = (session: AuthSession) => {
    setSession(session);
    toast.success(`Xush kelibsiz, ${session.user.firstName}!`);
    navigate(safeRedirectPath(searchParams.get('redirect')), { replace: true });
  };

  const login = useMutation({
    mutationFn: authService.login,
    onSuccess: (result) => {
      if ('twoFactorRequired' in result) {
        setChallenge(result.challengeToken);
        return;
      }
      signedIn(result);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['email', 'password'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    login.mutate(values);
  });

  if (challenge) {
    return (
      <TwoFactorStep
        challengeToken={challenge}
        onSignedIn={signedIn}
        onRestart={(message) => {
          setChallenge(null);
          setFormError(message);
        }}
      />
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-h1 tracking-tight">Tizimga kirish</h1>
        <p className="mt-2 text-body text-fg-muted">Xodimlar — email, o‘quvchilar — ID raqami (ST-000045), ota-onalar — telefon raqami bilan kiradi</p>
      </div>

      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField label="Login" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="username"
            autoFocus
            placeholder="email, +998 90 123 45 67 yoki ST-000045"
            leftIcon={<UserRound className="size-4" aria-hidden />}
            invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? fieldErrorId('email') : undefined}
            {...register('email')}
          />
        </FormField>

        <FormField
          label="Parol"
          htmlFor="password"
          error={errors.password?.message}
          labelAction={
            <Link to="/forgot-password" className="text-caption font-medium text-primary hover:underline">
              Parolni unutdingizmi?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            leftIcon={<Lock className="size-4" aria-hidden />}
            invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? fieldErrorId('password') : undefined}
            {...register('password')}
          />
        </FormField>

        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Kirish
        </Button>
      </form>

      <p className="mt-8 text-center text-body text-fg-muted">
        Hisobingiz yo‘qmi?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Ro‘yxatdan o‘ting
        </Link>
      </p>
    </>
  );
}

/** 2-qadam: ilovadagi 6 xonali kod yoki tiklash kodi. Tasdiqlash tokeni 5 daqiqa amal qiladi */
function TwoFactorStep({
  challengeToken,
  onSignedIn,
  onRestart,
}: {
  challengeToken: string;
  onSignedIn: (session: AuthSession) => void;
  onRestart: (message: string | null) => void;
}) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = useMutation({
    mutationFn: () => authService.loginTwoFactor({ challengeToken, code: code.trim() }),
    onSuccess: onSignedIn,
    onError: (mutationError) => {
      // Muddati o'tgan yoki yaroqsiz tasdiqlash — parolni qaytadan kiritish kerak
      if ((mutationError as { response?: { status?: number } }).response?.status === 401) {
        onRestart(getErrorMessage(mutationError));
        return;
      }
      setError(getErrorMessage(mutationError));
      setCode('');
    },
  });
  const ready = useRecovery ? code.trim().length >= 8 : /^\d{6}$/.test(code);

  return (
    <>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-h1 tracking-tight">
          <ShieldCheck className="size-7 text-primary" aria-hidden />
          Tasdiqlash kodi
        </h1>
        <p className="mt-2 text-body text-fg-muted">
          {useRecovery ? 'Saqlab qo‘ygan tiklash kodlaringizdan birini kiriting (masalan, ABCD-EFGH).' : 'Telefoningizdagi autentifikator ilovasi ko‘rsatgan 6 xonali kodni kiriting.'}
        </p>
      </div>
      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !verify.isPending) {
            setError(null);
            verify.mutate();
          }
        }}
      >
        <FormField label={useRecovery ? 'Tiklash kodi' : 'Kod'} htmlFor="two-factor-code">
          <Input
            id="two-factor-code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            maxLength={useRecovery ? 12 : 6}
            placeholder={useRecovery ? 'ABCD-EFGH' : '123456'}
            value={code}
            onChange={(event) => setCode(useRecovery ? event.target.value.toUpperCase() : event.target.value.replace(/\D/g, ''))}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={verify.isPending} disabled={!ready}>
          Kirish
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-2 text-body">
        <button
          type="button"
          className="focus-ring rounded-sm font-medium text-primary hover:underline"
          onClick={() => {
            setUseRecovery((value) => !value);
            setCode('');
            setError(null);
          }}
        >
          {useRecovery ? 'Ilovadagi kod bilan' : 'Telefon yo‘qmi? Tiklash kodi bilan'}
        </button>
        <button type="button" className="focus-ring rounded-sm text-fg-muted hover:text-fg" onClick={() => onRestart(null)}>
          Orqaga
        </button>
      </div>
    </>
  );
}
