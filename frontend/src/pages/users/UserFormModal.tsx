import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { PASSWORD_RULES, emailField, nameField, optionalPhoneField } from '@/lib/validation';
import { usersService } from '@/services/users.service';
import type { Role } from '@/types/role';
import type { UserListItem } from '@/types/user';

const baseSchema = z.object({
  firstName: nameField('Ism'),
  lastName: nameField('Familiya'),
  email: emailField,
  phone: optionalPhoneField,
  roleId: z.string().min(1, 'Rolni tanlang'),
  password: z.string(),
});

interface UserFormModalProps {
  mode: 'create' | 'edit';
  user?: UserListItem;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserFormModal({ mode, user, roles, onClose, onSaved }: UserFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  // Parol faqat yangi xodim yaratishda talab qilinadi
  const schema = useMemo(
    () =>
      baseSchema.superRefine((values, context) => {
        if (mode !== 'create') return;
        if (!PASSWORD_RULES.every((rule) => rule.test(values.password))) {
          context.addIssue({
            code: 'custom',
            path: ['password'],
            message: values.password ? 'Parol barcha talablarga javob berishi kerak' : 'Parol kiriting',
          });
        }
      }),
    [mode],
  );

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      roleId: user?.role.id ?? '',
      password: '',
    },
  });
  const password = useWatch({ control, name: 'password' });

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof baseSchema>) => {
      const payload = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        roleId: values.roleId,
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      };
      if (mode === 'create') {
        return usersService.create({ ...payload, password: values.password });
      }
      if (!user) throw new Error('Tahrirlanadigan xodim topilmadi');
      return usersService.update(user.id, payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['firstName', 'lastName', 'email', 'phone', 'roleId', 'password'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  return (
    <Modal
      open
      size="lg"
      title={mode === 'create' ? 'Yangi xodim' : 'Xodimni tahrirlash'}
      description={mode === 'create' ? 'Xodim darhol faol bo‘ladi va shu parol bilan tizimga kira oladi' : undefined}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <form id="user-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Ism" htmlFor="user-firstName" error={errors.firstName?.message} required>
          <Input id="user-firstName" autoFocus invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? fieldErrorId('user-firstName') : undefined} {...register('firstName')} />
        </FormField>
        <FormField label="Familiya" htmlFor="user-lastName" error={errors.lastName?.message} required>
          <Input id="user-lastName" invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? fieldErrorId('user-lastName') : undefined} {...register('lastName')} />
        </FormField>
        <FormField label="Email" htmlFor="user-email" error={errors.email?.message} required>
          <Input id="user-email" type="email" autoComplete="off" invalid={Boolean(errors.email)} aria-describedby={errors.email ? fieldErrorId('user-email') : undefined} {...register('email')} />
        </FormField>
        <FormField label="Telefon" htmlFor="user-phone" error={errors.phone?.message} hint="Ixtiyoriy">
          <Input id="user-phone" type="tel" placeholder="+998 90 123 45 67" invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? fieldErrorId('user-phone') : undefined} {...register('phone')} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Rol" htmlFor="user-roleId" error={errors.roleId?.message} required hint="Xodim qaysi bo‘limlarni ko‘ra olishi va nima qila olishini belgilaydi">
            <Select id="user-roleId" invalid={Boolean(errors.roleId)} aria-describedby={errors.roleId ? fieldErrorId('user-roleId') : undefined} {...register('roleId')}>
              <option value="">Rolni tanlang</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {mode === 'create' && (
          <div className="space-y-3 sm:col-span-2">
            <FormField label="Boshlang‘ich parol" htmlFor="user-password" error={errors.password?.message} required hint="Xodim kirgach, parolni Profil sahifasida o‘zgartirishi mumkin">
              <PasswordInput id="user-password" autoComplete="new-password" invalid={Boolean(errors.password)} aria-describedby={errors.password ? fieldErrorId('user-password') : undefined} {...register('password')} />
            </FormField>
            <PasswordRequirements value={password} />
          </div>
        )}
      </form>
    </Modal>
  );
}
