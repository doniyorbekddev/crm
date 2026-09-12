import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { getErrorMessage } from '@/lib/api';
import { newPasswordField } from '@/lib/validation';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

const resetSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string().min(1, 'Parolni takrorlang'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parollar bir xil emas',
  });

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } });
  const password = useWatch({ control, name: 'password' });

  const reset = useMutation({
    mutationFn: authService.resetPassword,
    onSuccess: (message) => {
      // Server barcha sessiyalarni yopdi — joriy tabdagi sessiya ham tozalanadi
      useAuthStore.getState().clearSession();
      toast.success(message);
      navigate('/login', { replace: true });
    },
  });

  if (!token) {
    return (
      <>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Havola noto‘g‘ri</h1>
        <Alert tone="error">Parolni tiklash havolasi to‘liq emas. Emaildagi havolani qaytadan oching yoki yangisini so‘rang.</Alert>
        <Link to="/forgot-password" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
          Yangi havola so‘rash
        </Link>
      </>
    );
  }

  const onSubmit = handleSubmit((values) => reset.mutate({ token, password: values.password }));

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Yangi parol o‘rnatish</h1>
        <p className="mt-2 text-sm text-fg-muted">Parol yangilangach, barcha qurilmalardagi sessiyalar yopiladi.</p>
      </div>

      {reset.isError && (
        <Alert tone="error" className="mb-5">
          {getErrorMessage(reset.error)}{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Yangi havola so‘rash
          </Link>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Yangi parol" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" autoFocus invalid={Boolean(errors.password)} aria-describedby={errors.password ? fieldErrorId('password') : undefined} {...register('password')} />
        </FormField>
        <PasswordRequirements value={password} />
        <FormField label="Parolni takrorlang" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <PasswordInput id="confirmPassword" autoComplete="new-password" invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? fieldErrorId('confirmPassword') : undefined} {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          Parolni saqlash
        </Button>
      </form>
    </>
  );
}
