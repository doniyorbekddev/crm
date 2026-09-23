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
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage, getErrorStatus, getFieldErrors } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { nameField } from '@/lib/validation';
import { leadsService } from '@/services/leads.service';
import { useAuthStore } from '@/store/auth.store';
import type { LeadDetail, LeadFormLookups, LeadPayload } from '@/types/lead';
import { GENDER_LABELS, LEAD_PRIORITY_LABELS, LEAD_PRIORITY_ORDER } from '@/utils/leadLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

const leadFormSchema = z.object({
  firstName: nameField('Ism'),
  lastName: z.string().trim().max(100, 'Familiya juda uzun'),
  phone: z
    .string()
    .trim()
    .min(1, 'Telefon raqamni kiriting')
    .refine((value) => /^\+?[\d\s()-]{9,20}$/.test(value), 'Telefon raqam noto‘g‘ri'),
  telegram: z
    .string()
    .trim()
    .refine((value) => value === '' || /^@?[A-Za-z0-9_]{3,63}$/.test(value), 'Telegram username noto‘g‘ri'),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || z.email().safeParse(value).success, 'Email noto‘g‘ri formatda'),
  age: z
    .string()
    .trim()
    .refine((value) => value === '' || (/^\d{1,3}$/.test(value) && Number(value) >= 3 && Number(value) <= 100), 'Yosh noto‘g‘ri'),
  gender: z.enum(['', 'MALE', 'FEMALE']),
  address: z.string().trim().max(255, 'Manzil juda uzun'),
  sourceId: z.string().min(1, 'Manbani tanlang'),
  courseId: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  assignedToId: z.string(),
  referralCode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^R?\d{1,6}$/i.test(value), 'Taklif kodi R00045 ko‘rinishida bo‘lsin'),
  notes: z.string().trim().max(2000, 'Izoh 2000 belgidan oshmasligi kerak'),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

function toPayload(values: LeadFormValues): LeadPayload {
  return {
    firstName: values.firstName,
    phone: values.phone,
    sourceId: values.sourceId,
    priority: values.priority,
    ...(values.lastName ? { lastName: values.lastName } : {}),
    ...(values.telegram ? { telegram: values.telegram } : {}),
    ...(values.email ? { email: values.email } : {}),
    ...(values.age ? { age: Number(values.age) } : {}),
    ...(values.gender ? { gender: values.gender } : {}),
    ...(values.address ? { address: values.address } : {}),
    ...(values.courseId ? { courseId: values.courseId } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
  };
}

interface LeadFormModalProps {
  mode: 'create' | 'edit';
  lead?: LeadDetail;
  lookups: LeadFormLookups;
  onClose: () => void;
  onSaved: (lead: LeadDetail) => void;
}

export function LeadFormModal({ mode, lead, lookups, onClose, onSaved }: LeadFormModalProps) {
  const currentUser = useAuthStore((state) => state.user);
  const canAssign = usePermission(PERMISSIONS.LEAD_ASSIGN);
  const canViewAll = usePermission(PERMISSIONS.LEAD_VIEW_ALL);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ message: string; values: LeadFormValues } | null>(null);

  const assigneeOptions = canViewAll ? lookups.managers : lookups.managers.filter((manager) => manager.id === currentUser?.id);

  const defaultValues: LeadFormValues = {
    firstName: lead?.firstName ?? '',
    lastName: lead?.lastName ?? '',
    phone: lead?.phone ?? '',
    telegram: lead?.telegram ?? '',
    email: lead?.email ?? '',
    age: lead?.age ? String(lead.age) : '',
    gender: lead?.gender ?? '',
    address: lead?.address ?? '',
    sourceId: lead?.source.id ?? '',
    courseId: lead?.course?.id ?? '',
    priority: lead?.priority ?? 'MEDIUM',
    // Sales Manager uchun yangi lead standart holatda o‘ziga biriktiriladi
    assignedToId: mode === 'create' && canAssign && !canViewAll && currentUser ? currentUser.id : '',
    referralCode: '',
    notes: lead?.notes ?? '',
  };

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(leadFormSchema), defaultValues });

  const save = useMutation({
    mutationFn: async ({ values, allowDuplicate }: { values: LeadFormValues; allowDuplicate: boolean }) => {
      const payload = toPayload(values);
      if (mode === 'create') {
        return leadsService.create({
          ...payload,
          ...(values.assignedToId ? { assignedToId: values.assignedToId } : {}),
          ...(values.referralCode ? { referralCode: values.referralCode.toUpperCase() } : {}),
          ...(allowDuplicate ? { allowDuplicate: true } : {}),
        });
      }
      if (!lead) throw new Error('Tahrirlanadigan lead topilmadi');
      return leadsService.update(lead.id, payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved(result.data);
    },
    onError: (error, variables) => {
      const isDuplicatePhone =
        mode === 'create' && getErrorStatus(error) === 409 && getFieldErrors(error).some((detail) => detail.field === 'phone');
      if (isDuplicatePhone) {
        setDuplicate({ message: getErrorMessage(error), values: variables.values });
        return;
      }
      if (!applyFieldErrors(error, setError, ['firstName', 'lastName', 'phone', 'telegram', 'email', 'age', 'sourceId', 'courseId', 'assignedToId'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setDuplicate(null);
    save.mutate({ values, allowDuplicate: false });
  });

  const describedBy = (field: keyof LeadFormValues) => (errors[field] ? fieldErrorId(`lead-${field}`) : undefined);

  return (
    <Modal
      open
      size="lg"
      title={mode === 'create' ? 'Yangi lead' : 'Leadni tahrirlash'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="lead-form" loading={save.isPending}>
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
      {duplicate && (
        <Alert tone="warning" className="mb-4" title={duplicate.message}>
          <p>Bu mijoz bilan allaqachon ishlanayotgan bo‘lishi mumkin. Baribir yangi lead yaratilsinmi?</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            loading={save.isPending}
            onClick={() => save.mutate({ values: duplicate.values, allowDuplicate: true })}
          >
            Baribir yaratish
          </Button>
        </Alert>
      )}

      <form id="lead-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">Mijoz</legend>
          <FormField label="Ism" htmlFor="lead-firstName" error={errors.firstName?.message} required>
            <Input id="lead-firstName" autoFocus invalid={Boolean(errors.firstName)} aria-describedby={describedBy('firstName')} {...register('firstName')} />
          </FormField>
          <FormField label="Familiya" htmlFor="lead-lastName" error={errors.lastName?.message}>
            <Input id="lead-lastName" invalid={Boolean(errors.lastName)} aria-describedby={describedBy('lastName')} {...register('lastName')} />
          </FormField>
          <FormField label="Telefon" htmlFor="lead-phone" error={errors.phone?.message} required>
            <Input id="lead-phone" type="tel" placeholder="+998 90 123 45 67" invalid={Boolean(errors.phone)} aria-describedby={describedBy('phone')} {...register('phone')} />
          </FormField>
          <FormField label="Telegram" htmlFor="lead-telegram" error={errors.telegram?.message}>
            <Input id="lead-telegram" placeholder="@username" invalid={Boolean(errors.telegram)} aria-describedby={describedBy('telegram')} {...register('telegram')} />
          </FormField>
          <FormField label="Email" htmlFor="lead-email" error={errors.email?.message}>
            <Input id="lead-email" type="email" invalid={Boolean(errors.email)} aria-describedby={describedBy('email')} {...register('email')} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Yosh" htmlFor="lead-age" error={errors.age?.message}>
              <Input id="lead-age" inputMode="numeric" invalid={Boolean(errors.age)} aria-describedby={describedBy('age')} {...register('age')} />
            </FormField>
            <FormField label="Jins" htmlFor="lead-gender">
              <Select id="lead-gender" {...register('gender')}>
                <option value="">—</option>
                <option value="MALE">{GENDER_LABELS.MALE}</option>
                <option value="FEMALE">{GENDER_LABELS.FEMALE}</option>
              </Select>
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Manzil" htmlFor="lead-address" error={errors.address?.message}>
              <Input id="lead-address" invalid={Boolean(errors.address)} {...register('address')} />
            </FormField>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">Sotuv</legend>
          <FormField label="Manba" htmlFor="lead-sourceId" error={errors.sourceId?.message} required>
            <Select id="lead-sourceId" invalid={Boolean(errors.sourceId)} aria-describedby={describedBy('sourceId')} {...register('sourceId')}>
              <option value="">Manbani tanlang</option>
              {lookups.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Qiziqqan kurs" htmlFor="lead-courseId" error={errors.courseId?.message}>
            <Select id="lead-courseId" invalid={Boolean(errors.courseId)} {...register('courseId')}>
              <option value="">Hali tanlanmagan</option>
              {lookups.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Muhimlik" htmlFor="lead-priority">
            <Select id="lead-priority" {...register('priority')}>
              {LEAD_PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {LEAD_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </FormField>
          {mode === 'create' && canAssign && (
            <FormField label="Mas’ul xodim" htmlFor="lead-assignedToId" error={errors.assignedToId?.message}>
              <Select id="lead-assignedToId" invalid={Boolean(errors.assignedToId)} {...register('assignedToId')}>
                <option value="">Biriktirilmagan</option>
                {assigneeOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {mode === 'create' && (
            <FormField
              label="Taklif kodi"
              htmlFor="lead-referralCode"
              error={errors.referralCode?.message}
              hint="Do‘sti taklif qilgan bo‘lsa: R00045"
            >
              <Input
                id="lead-referralCode"
                placeholder="R00045"
                invalid={Boolean(errors.referralCode)}
                {...register('referralCode')}
              />
            </FormField>
          )}
          <div className="sm:col-span-2">
            <FormField label="Izoh" htmlFor="lead-notes" error={errors.notes?.message}>
              <Textarea id="lead-notes" className="min-h-20" placeholder="Mijoz nima so‘radi, qanday kelishildi..." {...register('notes')} />
            </FormField>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
