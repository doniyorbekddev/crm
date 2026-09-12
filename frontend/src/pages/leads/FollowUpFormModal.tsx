import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { followUpsService } from '@/services/followUps.service';
import { lookupsService } from '@/services/lookups.service';
import type { FollowUpItem, FollowUpPayload } from '@/types/followUp';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

/** Tez-tez uchraydigan vazifalar — bir bosishda to‘ldirish uchun */
const TITLE_SUGGESTIONS = [
  'Qayta qo‘ng‘iroq qilish',
  'Kurs haqida ma’lumot yuborish',
  'Sinov darsiga taklif qilish',
  'Sinov darsini eslatish',
  'Shartnoma va to‘lov bo‘yicha kelishish',
] as const;

const followUpFormSchema = z.object({
  title: z.string().trim().min(3, 'Kamida 3 belgi').max(200, 'Nom juda uzun'),
  dueAt: z.string().min(1, 'Sana va vaqtni kiriting'),
  assignedToId: z.string(),
  notes: z.string().trim().max(2000, 'Izoh 2000 belgidan oshmasligi kerak'),
});

type FollowUpFormValues = z.infer<typeof followUpFormSchema>;

interface FollowUpFormModalProps {
  leadId: string;
  followUp?: FollowUpItem;
  onClose: () => void;
  onSaved: () => void;
}

export function FollowUpFormModal({ leadId, followUp, onClose, onSaved }: FollowUpFormModalProps) {
  const canViewAll = usePermission(PERMISSIONS.LEAD_VIEW_ALL);
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.leadForm,
    queryFn: lookupsService.leadForm,
    staleTime: 5 * 60_000,
    enabled: canViewAll,
  });

  const defaultValues: FollowUpFormValues = {
    title: followUp?.title ?? '',
    dueAt: toDateTimeInputValue(followUp?.dueAt ?? null),
    assignedToId: followUp?.assignedTo?.id ?? '',
    notes: followUp?.notes ?? '',
  };

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(followUpFormSchema), defaultValues });

  const save = useMutation({
    mutationFn: (values: FollowUpFormValues) => {
      const dueAt = fromDateTimeInputValue(values.dueAt);
      if (!dueAt) throw new Error('Sana noto‘g‘ri');
      const payload: FollowUpPayload = {
        title: values.title,
        dueAt,
        ...(values.notes ? { notes: values.notes } : {}),
        ...(values.assignedToId ? { assignedToId: values.assignedToId } : {}),
      };
      return followUp ? followUpsService.update(followUp.id, payload) : followUpsService.create({ ...payload, leadId });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['title', 'dueAt', 'assignedToId', 'notes'])) {
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
      title={followUp ? 'Follow-upni tahrirlash' : 'Yangi follow-up'}
      description={followUp ? undefined : 'Mijoz bilan keyingi aloqani rejalashtiring — vaqti kelganda eslatma keladi'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="follow-up-form" loading={save.isPending}>
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
      <form id="follow-up-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Vazifa" htmlFor="followup-title" error={errors.title?.message} required>
          <Input
            id="followup-title"
            autoFocus
            placeholder="Masalan: Sinov darsiga taklif qilish"
            invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? fieldErrorId('followup-title') : undefined}
            {...register('title')}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          {TITLE_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setValue('title', suggestion, { shouldValidate: true })}
              className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <FormField label="Muddat" htmlFor="followup-dueAt" error={errors.dueAt?.message} required hint="Eslatma 30 daqiqa oldin keladi">
          <Input
            id="followup-dueAt"
            type="datetime-local"
            invalid={Boolean(errors.dueAt)}
            aria-describedby={errors.dueAt ? fieldErrorId('followup-dueAt') : undefined}
            {...register('dueAt')}
          />
        </FormField>
        {canViewAll && (
          <FormField label="Mas’ul xodim" htmlFor="followup-assignedToId" error={errors.assignedToId?.message}>
            <Select id="followup-assignedToId" {...register('assignedToId')}>
              <option value="">Leadning mas’uli (yoki o‘zim)</option>
              {lookupsQuery.data?.managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Izoh" htmlFor="followup-notes" error={errors.notes?.message}>
          <Textarea id="followup-notes" className="min-h-20" placeholder="Nima haqida gaplashish kerak..." {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
