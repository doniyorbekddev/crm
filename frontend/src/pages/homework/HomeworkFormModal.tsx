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
import { homeworkService } from '@/services/homework.service';
import type { Homework } from '@/types/homework';
import { HOMEWORK_STATUS_LABELS, HOMEWORK_STATUS_ORDER } from '@/utils/homeworkLabels';

const schema = z.object({
  title: z.string().trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
  description: z.string().trim().max(2000, 'Tavsif juda uzun'),
  groupId: z.string().min(1, 'Guruhni tanlang'),
  deadline: z.string().min(1, 'Muddatni kiriting'),
  maxPoints: z.string().refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1, 'Ball 1–1000 oralig‘ida'),
  xpReward: z.string().refine((value) => /^\d{1,4}$/.test(value), 'XP 0–1000 oralig‘ida'),
  status: z.enum(HOMEWORK_STATUS_ORDER),
});

type FormValues = z.infer<typeof schema>;

interface HomeworkFormModalProps {
  homework?: Homework;
  onClose: () => void;
  onSaved: () => void;
}

/** Muddat uchun standart qiymat: bugundan bir hafta keyin, 18:00 */
function defaultDeadline(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(18, 0, 0, 0);
  return `${date.toISOString().slice(0, 10)}T18:00`;
}

export function HomeworkFormModal({ homework, onClose, onSaved }: HomeworkFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(homework);

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
      title: homework?.title ?? '',
      description: homework?.description ?? '',
      groupId: homework?.group.id ?? '',
      deadline: homework ? homework.deadline.slice(0, 16) : defaultDeadline(),
      maxPoints: String(homework?.maxPoints ?? 100),
      xpReward: String(homework?.xpReward ?? 20),
      status: homework?.status ?? ('PUBLISHED' as const),
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        title: values.title,
        ...(values.description ? { description: values.description } : {}),
        deadline: new Date(values.deadline).toISOString(),
        maxPoints: Number(values.maxPoints),
        xpReward: Number(values.xpReward),
        status: values.status,
      };
      return homework
        ? homeworkService.update(homework.id, payload)
        : homeworkService.create({ ...payload, groupId: values.groupId });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['title', 'groupId', 'deadline', 'maxPoints', 'xpReward'])) {
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
      title={isEdit ? 'Uy vazifasini tahrirlash' : 'Yangi uy vazifasi'}
      description={isEdit ? `${homework?.group.name} guruhi` : 'E’lon qilinganda guruhdagi barcha o‘quvchilarga ochiladi'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="homework-form" loading={save.isPending}>
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

      <form id="homework-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Sarlavha" htmlFor="hw-title" error={errors.title?.message} required>
          <Input id="hw-title" autoFocus placeholder="React hooks amaliyoti" invalid={Boolean(errors.title)} {...register('title')} />
        </FormField>

        {!isEdit && (
          <FormField label="Guruh" htmlFor="hw-group" error={errors.groupId?.message} required>
            <Select
              id="hw-group"
              invalid={Boolean(errors.groupId)}
              aria-describedby={errors.groupId ? fieldErrorId('hw-group') : undefined}
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FormField label="Topshirish muddati" htmlFor="hw-deadline" error={errors.deadline?.message} required>
              <Input id="hw-deadline" type="datetime-local" {...register('deadline')} />
            </FormField>
          </div>
          <FormField label="Holat" htmlFor="hw-status" error={errors.status?.message}>
            <Select id="hw-status" {...register('status')}>
              {HOMEWORK_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {HOMEWORK_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Maksimal ball" htmlFor="hw-maxPoints" error={errors.maxPoints?.message} required>
            <Input id="hw-maxPoints" inputMode="numeric" {...register('maxPoints')} />
          </FormField>
          <FormField label="XP mukofoti" htmlFor="hw-xp" error={errors.xpReward?.message} hint="Topshirganda beriladi">
            <Input id="hw-xp" inputMode="numeric" {...register('xpReward')} />
          </FormField>
        </div>

        <FormField label="Tavsif" htmlFor="hw-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Textarea id="hw-description" rows={3} placeholder="Nima qilish kerakligini yozing" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
