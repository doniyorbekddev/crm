import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { Checkbox } from '@/components/ui/Checkbox';
import type { Exam, ExamBlueprint } from '@/types/homework';
import { EXAM_STATUS_LABELS, EXAM_STATUS_ORDER, EXAM_TYPE_LABELS, EXAM_TYPE_ORDER } from '@/utils/homeworkLabels';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/utils/format';
import { BlueprintEditor, blueprintDraftFrom, blueprintFromDraft } from './BlueprintEditor';

function sameBlueprint(a: ExamBlueprint | null, b: ExamBlueprint | null): boolean {
  const canonical = (value: ExamBlueprint | null) =>
    value ? JSON.stringify({ total: value.total, topics: value.topics.map((topic) => [topic.topicId, topic.percent]), difficulty: value.difficulty ?? null }) : 'null';
  return canonical(a) === canonical(b);
}

const schema = z
  .object({
    title: z.string().trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
    description: z.string().trim().max(2000, 'Tavsif juda uzun'),
    groupId: z.string().min(1, 'Guruhni tanlang'),
    date: z.string().min(1, 'Sanani kiriting'),
    maxScore: z.string().refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1, 'Ball 1–1000 oralig‘ida'),
    passScore: z.string().refine((value) => value === '' || /^\d{1,4}$/.test(value), 'Butun son kiriting'),
    durationMinutes: z
      .string()
      .refine((value) => value === '' || (/^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 600), '1–600 daqiqa'),
    maxAttempts: z.string().refine((value) => /^\d{1,2}$/.test(value) && Number(value) <= 20, '0–20 oralig‘ida'),
    xpReward: z.string().refine((value) => /^\d{1,4}$/.test(value), 'XP 0–1000 oralig‘ida'),
    status: z.enum(EXAM_STATUS_ORDER),
    type: z.enum(EXAM_TYPE_ORDER),
    isOnline: z.boolean(),
    startAt: z.string(),
    endAt: z.string(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
  })
  .refine((values) => !values.startAt || !values.endAt || new Date(values.startAt) < new Date(values.endAt), {
    path: ['endAt'],
    message: 'Tugash vaqti boshlanishdan keyin bo‘lsin',
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
  const [blueprintDraft, setBlueprintDraft] = useState(() => blueprintDraftFrom(exam?.blueprint));

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
    control,
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
      durationMinutes: exam?.durationMinutes === null || exam?.durationMinutes === undefined ? '' : String(exam.durationMinutes),
      maxAttempts: String(exam?.maxAttempts ?? 0),
      xpReward: String(exam?.xpReward ?? 50),
      status: exam?.status ?? ('PLANNED' as const),
      type: exam?.type ?? ('MONTHLY_EXAM' as const),
      isOnline: exam?.isOnline ?? false,
      startAt: toDateTimeInputValue(exam?.startAt),
      endAt: toDateTimeInputValue(exam?.endAt),
      shuffleQuestions: exam?.shuffleQuestions ?? false,
      shuffleOptions: exam?.shuffleOptions ?? false,
    },
  });
  const isOnline = useWatch({ control, name: 'isOnline' });
  const selectedGroupId = useWatch({ control, name: 'groupId' });
  const courseId = exam ? (exam.course?.id ?? null) : ((groupsQuery.data?.items ?? []).find((group) => group.id === selectedGroupId)?.course.id ?? null);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const blueprint = blueprintFromDraft(blueprintDraft);
      if (blueprint.error) throw new Error(blueprint.error);
      const blueprintChanged = !sameBlueprint(blueprint.value, exam?.blueprint ?? null);
      const payload = {
        title: values.title,
        ...(values.description ? { description: values.description } : {}),
        date: values.date,
        maxScore: Number(values.maxScore),
        ...(values.passScore === '' ? {} : { passScore: Number(values.passScore) }),
        ...(values.durationMinutes === '' ? {} : { durationMinutes: Number(values.durationMinutes) }),
        maxAttempts: Number(values.maxAttempts),
        xpReward: Number(values.xpReward),
        status: values.status,
        type: values.type,
        isOnline: values.isOnline,
        startAt: fromDateTimeInputValue(values.startAt) ?? null,
        endAt: fromDateTimeInputValue(values.endAt) ?? null,
        shuffleQuestions: values.shuffleQuestions,
        shuffleOptions: values.shuffleOptions,
        // Blueprint faqat o'zgarganda yuboriladi — urinishlar boshlangach server uni qulflaydi
        ...(blueprintChanged ? { blueprint: blueprint.value } : {}),
      };
      return exam ? examsService.update(exam.id, payload) : examsService.create({ ...payload, groupId: values.groupId });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['title', 'groupId', 'date', 'maxScore', 'passScore', 'xpReward', 'durationMinutes', 'maxAttempts', 'startAt', 'endAt'])) {
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

        <FormField label="Turi" htmlFor="exam-type">
          <Select id="exam-type" {...register('type')}>
            {EXAM_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {EXAM_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </FormField>

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
          <FormField
            label="Davomiyligi (daqiqa)"
            htmlFor="exam-duration"
            error={errors.durationMinutes?.message}
            hint="Bo‘sh — vaqt chegarasi yo‘q"
          >
            <Input id="exam-duration" inputMode="numeric" {...register('durationMinutes')} />
          </FormField>
          <FormField label="Urinishlar soni" htmlFor="exam-attempts" error={errors.maxAttempts?.message} hint="0 — cheklanmagan">
            <Input id="exam-attempts" inputMode="numeric" {...register('maxAttempts')} />
          </FormField>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium text-fg">Onlayn topshirish</legend>
          <Checkbox label="O‘quvchilar kabinetdan o‘zi topshiradi" {...register('isOnline')} />
          {isOnline && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Ochiladi" htmlFor="exam-start" error={errors.startAt?.message} hint="Bo‘sh — darhol">
                  <Input id="exam-start" type="datetime-local" {...register('startAt')} />
                </FormField>
                <FormField label="Yopiladi" htmlFor="exam-end" error={errors.endAt?.message} hint="Bo‘sh — muddatsiz">
                  <Input id="exam-end" type="datetime-local" invalid={Boolean(errors.endAt)} {...register('endAt')} />
                </FormField>
              </div>
              <Checkbox label="Savollar tartibini aralashtirish" {...register('shuffleQuestions')} />
              <Checkbox label="Variantlar tartibini aralashtirish" {...register('shuffleOptions')} />
              <BlueprintEditor draft={blueprintDraft} onChange={setBlueprintDraft} courseId={courseId} groupId={exam?.group.id ?? (selectedGroupId || null)} />
            </>
          )}
        </fieldset>

        <FormField label="Tavsif" htmlFor="exam-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Textarea id="exam-description" rows={2} {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
