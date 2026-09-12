import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { newPasswordField } from '@/lib/validation';
import { usersService } from '@/services/users.service';
import type { UserListItem } from '@/types/user';

const resetSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string().min(1, 'Parolni takrorlang'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parollar bir xil emas',
  });

interface ResetUserPasswordModalProps {
  user: UserListItem;
  onClose: () => void;
  onDone: () => void;
}

export function ResetUserPasswordModal({ user, onClose, onDone }: ResetUserPasswordModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } });
  const password = useWatch({ control, name: 'password' });

  const reset = useMutation({
    mutationFn: (newPassword: string) => usersService.resetPassword(user.id, newPassword),
    onSuccess: (message) => {
      toast.success(message);
      onDone();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['password'])) setFormError(getErrorMessage(error));
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    reset.mutate(values.password);
  });

  return (
    <Modal
      open
      size="sm"
      title="Parolni tiklash"
      description={`${user.firstName} ${user.lastName} uchun yangi parol. Xodimning barcha qurilmalardagi sessiyalari yopiladi.`}
      onClose={onClose}
      closeDisabled={reset.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={reset.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="reset-user-password-form" loading={reset.isPending}>
            Parolni saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <form id="reset-user-password-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Yangi parol" htmlFor="reset-password" error={errors.password?.message}>
          <PasswordInput id="reset-password" autoComplete="new-password" autoFocus invalid={Boolean(errors.password)} aria-describedby={errors.password ? fieldErrorId('reset-password') : undefined} {...register('password')} />
        </FormField>
        <PasswordRequirements value={password} />
        <FormField label="Parolni takrorlang" htmlFor="reset-confirm" error={errors.confirmPassword?.message}>
          <PasswordInput id="reset-confirm" autoComplete="new-password" invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? fieldErrorId('reset-confirm') : undefined} {...register('confirmPassword')} />
        </FormField>
      </form>
    </Modal>
  );
}
