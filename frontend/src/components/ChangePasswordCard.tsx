import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { newPasswordField } from '@/lib/validation';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Joriy parolni kiriting'),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, 'Parolni takrorlang'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parollar bir xil emas',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Yangi parol joriy paroldan farq qilishi kerak',
  });

/** Parolni o‘zgartirish — xodim profili va kabinet sozlamalarida bir xil */
export function ChangePasswordCard() {
  const setSession = useAuthStore((state) => state.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control, name: 'newPassword' });

  const change = useMutation({
    mutationFn: authService.changePassword,
    onSuccess: (result) => {
      setSession(result.data);
      reset();
      toast.success(result.message);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['currentPassword', 'newPassword'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit(({ currentPassword, newPassword }) => {
    setFormError(null);
    change.mutate({ currentPassword, newPassword });
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-fg-muted" aria-hidden />
            Parolni o‘zgartirish
          </CardTitle>
          <CardDescription>O‘zgartirilgach, boshqa qurilmalardagi sessiyalar yopiladi</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {formError && (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        )}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField label="Joriy parol" htmlFor="currentPassword" error={errors.currentPassword?.message}>
            <PasswordInput id="currentPassword" autoComplete="current-password" invalid={Boolean(errors.currentPassword)} aria-describedby={errors.currentPassword ? fieldErrorId('currentPassword') : undefined} {...register('currentPassword')} />
          </FormField>
          <FormField label="Yangi parol" htmlFor="newPassword" error={errors.newPassword?.message}>
            <PasswordInput id="newPassword" autoComplete="new-password" invalid={Boolean(errors.newPassword)} aria-describedby={errors.newPassword ? fieldErrorId('newPassword') : undefined} {...register('newPassword')} />
          </FormField>
          <PasswordRequirements value={newPassword} />
          <FormField label="Yangi parolni takrorlang" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
            <PasswordInput id="confirmPassword" autoComplete="new-password" invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? fieldErrorId('confirmPassword') : undefined} {...register('confirmPassword')} />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" loading={change.isPending}>
              Parolni saqlash
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

