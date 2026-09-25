import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Lock, UserRound } from 'lucide-react';
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

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: authService.login,
    onSuccess: (session) => {
      setSession(session);
      toast.success(`Xush kelibsiz, ${session.user.firstName}!`);
      navigate(safeRedirectPath(searchParams.get('redirect')), { replace: true });
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

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Tizimga kirish</h1>
        <p className="mt-2 text-sm text-fg-muted">Xodimlar — email, o‘quvchilar — ID raqami (masalan, ST-000045) bilan kiradi</p>
      </div>

      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField label="Email yoki ID" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="username"
            autoFocus
            placeholder="siz@example.com yoki ST-000045"
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
            <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
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

      <p className="mt-8 text-center text-sm text-fg-muted">
        Hisobingiz yo‘qmi?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
          Ro‘yxatdan o‘ting
        </Link>
      </p>
    </>
  );
}
