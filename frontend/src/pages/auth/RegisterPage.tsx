import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { emailField, nameField, newPasswordField, optionalPhoneField } from '@/lib/validation';
import { authService } from '@/services/auth.service';

const registerSchema = z
  .object({
    firstName: nameField('Ism'),
    lastName: nameField('Familiya'),
    email: emailField,
    phone: optionalPhoneField,
    password: newPasswordField,
    confirmPassword: z.string().min(1, 'Parolni takrorlang'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parollar bir xil emas',
  });

export default function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });

  const signUp = useMutation({
    mutationFn: authService.register,
    onSuccess: (result) => setSuccessMessage(result.message),
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['firstName', 'lastName', 'email', 'phone', 'password'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit(({ confirmPassword: _confirm, phone, ...values }) => {
    setFormError(null);
    signUp.mutate({ ...values, ...(phone ? { phone } : {}) });
  });

  if (successMessage) {
    return (
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <CheckCircle2 className="size-7" aria-hidden />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">So‘rovingiz qabul qilindi</h1>
        <p className="mt-3 text-sm text-fg-muted">{successMessage}</p>
        <Link
          to="/login"
          className="mt-8 inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          Kirish sahifasiga qaytish
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ro‘yxatdan o‘tish</h1>
        <p className="mt-2 text-sm text-fg-muted">Hisob administrator tasdiqlagandan so‘ng faollashadi</p>
      </div>

      {formError && (
        <Alert tone="error" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ism" htmlFor="firstName" error={errors.firstName?.message} required>
            <Input id="firstName" autoComplete="given-name" autoFocus invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? fieldErrorId('firstName') : undefined} {...register('firstName')} />
          </FormField>
          <FormField label="Familiya" htmlFor="lastName" error={errors.lastName?.message} required>
            <Input id="lastName" autoComplete="family-name" invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? fieldErrorId('lastName') : undefined} {...register('lastName')} />
          </FormField>
        </div>

        <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" placeholder="siz@example.com" invalid={Boolean(errors.email)} aria-describedby={errors.email ? fieldErrorId('email') : undefined} {...register('email')} />
        </FormField>

        <FormField label="Telefon" htmlFor="phone" error={errors.phone?.message} hint="Ixtiyoriy">
          <Input id="phone" type="tel" autoComplete="tel" placeholder="+998 90 123 45 67" invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? fieldErrorId('phone') : undefined} {...register('phone')} />
        </FormField>

        <FormField label="Parol" htmlFor="password" error={errors.password?.message} required>
          <PasswordInput id="password" autoComplete="new-password" invalid={Boolean(errors.password)} aria-describedby={errors.password ? fieldErrorId('password') : undefined} {...register('password')} />
        </FormField>
        <PasswordRequirements value={password} />

        <FormField label="Parolni takrorlang" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
          <PasswordInput id="confirmPassword" autoComplete="new-password" invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? fieldErrorId('confirmPassword') : undefined} {...register('confirmPassword')} />
        </FormField>

        <Button type="submit" size="lg" className="w-full" loading={signUp.isPending}>
          Ro‘yxatdan o‘tish
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        Hisobingiz bormi?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
          Kirish
        </Link>
      </p>
    </>
  );
}
