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
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import { examsService } from '@/services/homework.service';
import type { Exam } from '@/types/homework';
import { EXAM_STATUS_LABELS, EXAM_STATUS_ORDER } from '@/utils/homeworkLabels';

const schema = z
  .object({
    title: z.string().trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
    description: z.string().trim().max(2000, 'Tavsif juda uzun'),
    groupId: z.string().min(1, 'Guruhni tanlang'),
    date: z.string().min(1, 'Sanani kiriting'),
    maxScore: z.string().refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1, 'Ball 1–1000 oralig‘ida'),
    passScore: z.string().refine((value) => value === '' || /^\d{1,4}$/.test(value), 'Butun son kiriting'),
    xpReward: z.string().refine((value) => /^\d{1,4}$/.test(value), 'XP 0–1000 oralig‘ida'),
    status: z.enum(EXAM_STATUS_ORDER),
  })
  .refine((values) => values.passScore === '' || Number(values.passScore) <= Number(values.maxScore), {
    path: ['passScore'],
    message: 'O‘tish bali maksimal balldan katta bo‘lmasin',
  });

type FormValues = z.infer<typeof schema>;

interface ExamFormModalProps {
  exam?: Exam;
  onClose: () => void;
  onSaved: () => void;
}

export function ExamFormModal({ exam, onClose, onSaved }: ExamFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(exam);

  const groupsQuery = useQuery({
    queryKey: queryKeys.groups.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    queryFn: () => groupsService.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    enabled: !isEdit,
    staleTime: 60_000,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: exam?.title ?? '',
      description: exam?.description ?? '',
      groupId: exam?.group.id ?? '',
      date: exam?.date ?? new Date().toISOString().slice(0, 10),
      maxScore: String(exam?.maxScore ?? 100),
      passScore: exam?.passScore === null || exam?.passScore === undefined ? '60' : String(exam.passScore),
      xpReward: String(exam?.xpReward ?? 50),
      status: exam?.status ?? ('PLANNED' as const),
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        title: values.title,
        ...(values.description ? { description: values.description } : {}),
        date: values.date,
        maxScore: Number(values.maxScore),
        ...(values.passScore === '' ? {} : { passScore: Number(values.passScore) }),
        xpReward: Number(values.xpReward),
        status: values.status,
      };
      return exam ? examsService.update(exam.id, payload) : examsService.create({ ...payload, groupId: values.groupId });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['title', 'groupId', 'date', 'maxScore', 'passScore', 'xpReward'])) {
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
      title={isEdit ? 'Imtihonni tahrirlash' : 'Yangi imtihon'}
      description={isEdit ? `${exam?.group.name} guruhi` : 'Guruh uchun imtihon yoki test'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="exam-form" loading={save.isPending}>
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

      <form id="exam-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Sarlavha" htmlFor="exam-title" error={errors.title?.message} required>
          <Input id="exam-title" autoFocus placeholder="Oraliq imtihon" invalid={Boolean(errors.title)} {...register('title')} />
        </FormField>

        {!isEdit && (
          <FormField label="Guruh" htmlFor="exam-group" error={errors.groupId?.message} required>
            <Select
              id="exam-group"
              invalid={Boolean(errors.groupId)}
              aria-describedby={errors.groupId ? fieldErrorId('exam-group') : undefined}
              disabled={groupsQuery.isPending}
              {...register('groupId')}
            >
              <option value="">Tanlang…</option>
              {(groupsQuery.data?.items ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} · {group.course.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Sana" htmlFor="exam-date" error={errors.date?.message} required>
            <Input id="exam-date" type="date" {...register('date')} />
          </FormField>
          <FormField label="Holat" htmlFor="exam-status" error={errors.status?.message}>
            <Select id="exam-status" {...register('status')}>
              {EXAM_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {EXAM_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Maksimal ball" htmlFor="exam-max" error={errors.maxScore?.message} required>
            <Input id="exam-max" inputMode="numeric" {...register('maxScore')} />
          </FormField>
          <FormField label="O‘tish bali" htmlFor="exam-pass" error={errors.passScore?.message} hint="Bo‘sh qoldirish mumkin">
            <Input id="exam-pass" inputMode="numeric" {...register('passScore')} />
          </FormField>
          <FormField label="XP mukofoti" htmlFor="exam-xp" error={errors.xpReward?.message} hint="Yuqori natija uchun">
            <Input id="exam-xp" inputMode="numeric" {...register('xpReward')} />
          </FormField>
        </div>

        <FormField label="Tavsif" htmlFor="exam-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Textarea id="exam-description" rows={2} {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
