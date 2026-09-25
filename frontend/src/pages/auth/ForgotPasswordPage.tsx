import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { getErrorMessage } from '@/lib/api';
import { emailField } from '@/lib/validation';
import { authService } from '@/services/auth.service';

const forgotSchema = z.object({ email: emailField });

export default function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const request = useMutation({ mutationFn: authService.forgotPassword });

  const onSubmit = handleSubmit(({ email }) => request.mutate(email));

  return (
    <>
      <Link to="/login" className="mb-8 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Kirish sahifasi
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Parolni tiklash</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Hisobingizga bog‘langan emailni kiriting — parolni tiklash havolasini yuboramiz.
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          O‘quvchi ID raqami bilan kirsangiz — yangi parol uchun o‘quv markaz administratoriga murojaat qiling.
        </p>
      </div>

      {request.isSuccess ? (
        <Alert tone="success" title="Havola yuborildi">
          {request.data} Havola 30 daqiqa amal qiladi. Xat kelmasa, «Spam» papkasini tekshiring.
        </Alert>
      ) : (
        <>
          {request.isError && (
            <Alert tone="error" className="mb-5">
              {getErrorMessage(request.error)}
            </Alert>
          )}
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <FormField label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="siz@example.com"
                leftIcon={<Mail className="size-4" aria-hidden />}
                invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? fieldErrorId('email') : undefined}
                {...register('email')}
              />
            </FormField>
            <Button type="submit" size="lg" className="w-full" loading={request.isPending}>
              Havolani yuborish
            </Button>
          </form>
        </>
      )}
    </>
  );
}
