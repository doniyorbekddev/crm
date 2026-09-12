import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { rolesService } from '@/services/roles.service';
import type { Role } from '@/types/role';

const roleFormSchema = z.object({
  name: z.string().trim().min(2, 'Rol nomi kamida 2 belgidan iborat bo‘lishi kerak').max(100, 'Rol nomi juda uzun'),
  key: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{2,49}$/, 'Faqat lotin katta harflari, raqam va _ (masalan: SENIOR_MANAGER)'),
  description: z.string().trim().max(255, 'Tavsif 255 belgidan oshmasligi kerak'),
  copyFromRoleId: z.string(),
});

/** "Katta menejer" → "KATTA_MENEJER" */
function toRoleKey(name: string): string {
  const key = name
    .normalize('NFKD')
    .replace(/[̀-ͯ‘’'`ʻʼ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 50);
  return /^[A-Z]/.test(key) ? key : key ? `ROLE_${key}`.slice(0, 50) : '';
}

interface RoleFormModalProps {
  mode: 'create' | 'edit';
  role?: Role;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}

export function RoleFormModal({ mode, role, roles, onClose, onSaved }: RoleFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(mode === 'edit');

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name ?? '',
      key: role?.key ?? '',
      description: role?.description ?? '',
      copyFromRoleId: '',
    },
  });

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof roleFormSchema>) => {
      const description = values.description ? { description: values.description } : {};
      if (mode === 'edit') {
        if (!role) throw new Error('Tahrirlanadigan rol topilmadi');
        return rolesService.update(role.id, { name: values.name, ...description });
      }
      const source = roles.find((item) => item.id === values.copyFromRoleId);
      return rolesService.create({
        key: values.key,
        name: values.name,
        ...description,
        permissionKeys: source ? source.permissions : [],
      });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['name', 'key', 'description'])) {
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
      title={mode === 'create' ? 'Yangi rol' : 'Rolni tahrirlash'}
      description={mode === 'create' ? 'Rol yaratilgach, ruxsatlarni jadvalda belgilaysiz' : undefined}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="role-form" loading={save.isPending}>
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
      <form id="role-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Nomi" htmlFor="role-name" error={errors.name?.message} required>
          <Input
            id="role-name"
            autoFocus
            placeholder="Masalan: Katta menejer"
            invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? fieldErrorId('role-name') : undefined}
            {...register('name', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                if (!keyTouched) setValue('key', toRoleKey(event.target.value));
              },
            })}
          />
        </FormField>
        <FormField
          label="Kalit"
          htmlFor="role-key"
          error={errors.key?.message}
          required
          hint={mode === 'edit' ? 'Kalitni o‘zgartirib bo‘lmaydi' : 'Tizim ichida ishlatiladi, keyin o‘zgartirib bo‘lmaydi'}
        >
          <Input
            id="role-key"
            className="font-mono uppercase"
            disabled={mode === 'edit'}
            invalid={Boolean(errors.key)}
            aria-describedby={errors.key ? fieldErrorId('role-key') : undefined}
            {...register('key', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                setKeyTouched(true);
                setValue('key', event.target.value.toUpperCase());
              },
            })}
          />
        </FormField>
        <FormField label="Tavsif" htmlFor="role-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Input id="role-description" invalid={Boolean(errors.description)} {...register('description')} />
        </FormField>
        {mode === 'create' && (
          <FormField label="Ruxsatlarni nusxalash" htmlFor="role-copy" hint="Mavjud roldan boshlang‘ich ruxsatlarni olish">
            <Select id="role-copy" {...register('copyFromRoleId')}>
              <option value="">Ruxsatsiz boshlash</option>
              {roles
                .filter((item) => item.key !== 'SUPER_ADMIN')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.permissions.length} ta ruxsat)
                  </option>
                ))}
            </Select>
          </FormField>
        )}
      </form>
    </Modal>
  );
}
