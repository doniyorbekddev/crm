import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { nameField } from '@/lib/validation';
import { parentsService } from '@/services/parents.service';
import type { ParentItem, ParentPayload, ParentRelation } from '@/types/parent';
import { RelationFields } from './RelationFields';

const schema = z.object({
  firstName: nameField('Ism'),
  lastName: nameField('Familiya'),
  phone: z
    .string()
    .trim()
    .min(1, 'Telefon kiriting')
    .refine((value) => /^\+?[\d\s()-]{9,20}$/.test(value), 'Telefon raqam noto‘g‘ri'),
  telegram: z.string().trim().max(64, 'Telegram juda uzun'),
  email: z.string().trim().refine((value) => value === '' || z.email().safeParse(value).success, 'Email noto‘g‘ri formatda'),
  notes: z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasligi kerak'),
});

type FormValues = z.infer<typeof schema>;

function toPayload(values: FormValues): ParentPayload {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    telegram: values.telegram || null,
    email: values.email || null,
    notes: values.notes || null,
  };
}

interface ParentFormModalProps {
  parent?: ParentItem;
  /** O‘quvchi profilidan ochilganda — yangi ota-ona shu o‘quvchiga biriktiriladi */
  student?: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}

export function ParentFormModal({ parent, student, onClose, onSaved }: ParentFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [relation, setRelation] = useState<ParentRelation>('GUARDIAN');
  const [isPrimary, setIsPrimary] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: parent?.firstName ?? '',
      lastName: parent?.lastName ?? '',
      phone: parent?.phone ?? '',
      telegram: parent?.telegram ?? '',
      email: parent?.email ?? '',
      notes: parent?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      parent
        ? parentsService.update(parent.id, toPayload(values))
        : parentsService.create({
            ...toPayload(values),
            ...(student ? { students: [{ studentId: student.id, relation, isPrimary }] } : {}),
          }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['firstName', 'lastName', 'phone', 'telegram', 'email', 'notes'])) {
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
      title={parent ? 'Ota-onani tahrirlash' : 'Ota-ona qo‘shish'}
      description={student ? `${student.name} uchun` : parent ? `${parent.firstName} ${parent.lastName}` : 'Farzandlarni keyin biriktirish mumkin'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="parent-form" loading={save.isPending}>
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

      <form id="parent-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ism" htmlFor="parent-firstName" error={errors.firstName?.message} required>
            <Input id="parent-firstName" autoFocus invalid={Boolean(errors.firstName)} {...register('firstName')} />
          </FormField>
          <FormField label="Familiya" htmlFor="parent-lastName" error={errors.lastName?.message} required>
            <Input id="parent-lastName" invalid={Boolean(errors.lastName)} {...register('lastName')} />
          </FormField>
          <FormField label="Telefon" htmlFor="parent-phone" error={errors.phone?.message} required>
            <Input id="parent-phone" type="tel" placeholder="+998 90 123 45 67" invalid={Boolean(errors.phone)} {...register('phone')} />
          </FormField>
          <FormField label="Telegram" htmlFor="parent-telegram" error={errors.telegram?.message}>
            <Input id="parent-telegram" placeholder="@username" {...register('telegram')} />
          </FormField>
          <FormField label="Email" htmlFor="parent-email" error={errors.email?.message}>
            <Input id="parent-email" type="email" invalid={Boolean(errors.email)} {...register('email')} />
          </FormField>
        </div>

        {student && !parent && (
          <RelationFields
            idPrefix="parent-form"
            relation={relation}
            isPrimary={isPrimary}
            onRelationChange={setRelation}
            onPrimaryChange={setIsPrimary}
          />
        )}

        <FormField label="Izoh" htmlFor="parent-notes" error={errors.notes?.message}>
          <Textarea id="parent-notes" rows={2} {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
