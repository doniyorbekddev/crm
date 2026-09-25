import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import { homeworkService, rubricsService } from '@/services/homework.service';
import { lessonsService } from '@/services/lessons.service';
import { studentsService } from '@/services/students.service';
import type { Difficulty, Homework, HomeworkTarget } from '@/types/homework';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  HOMEWORK_STATUS_LABELS,
  HOMEWORK_STATUS_ORDER,
  HOMEWORK_TARGET_LABELS,
  HOMEWORK_TARGET_ORDER,
} from '@/utils/homeworkLabels';

const schema = z.object({
  title: z.string().trim().min(3, 'Kamida 3 belgi').max(200, 'Sarlavha juda uzun'),
  description: z.string().trim().max(2000, 'Tavsif juda uzun'),
  groupId: z.string().min(1, 'Guruhni tanlang'),
  deadline: z.string().min(1, 'Muddatni kiriting'),
  maxPoints: z.string().refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1, 'Ball 1–1000 oralig‘ida'),
  xpReward: z.string().refine((value) => /^\d{1,4}$/.test(value), 'XP 0–1000 oralig‘ida'),
  status: z.enum(HOMEWORK_STATUS_ORDER),
  targetType: z.enum(HOMEWORK_TARGET_ORDER),
  topicId: z.string(),
  lessonId: z.string(),
  difficulty: z.string(),
  rubricId: z.string(),
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

/**
 * Uy vazifasi (TZ §15): sarlavha, tavsif, guruh, **kimga** (butun guruh / tanlangan / bitta),
 * mavzu va dars (LMS), qiyinlik, muddat, maksimal ball, rubrika. Fayl va havolalar vazifa
 * saqlangach "Batafsil" oynasida biriktiriladi.
 */
export function HomeworkFormModal({ homework, onClose, onSaved }: HomeworkFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [studentIds, setStudentIds] = useState<string[]>([]);
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
    control,
    setValue,
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
      targetType: homework?.targetType ?? ('GROUP' as HomeworkTarget),
      topicId: homework?.topic?.id ?? '',
      lessonId: homework?.lesson?.id ?? '',
      difficulty: homework?.difficulty ?? '',
      rubricId: homework?.rubric?.id ?? '',
    },
  });

  const groupId = useWatch({ control, name: 'groupId' });
  const targetType = useWatch({ control, name: 'targetType' });
  const topicId = useWatch({ control, name: 'topicId' });
  const courseId = homework?.course?.id ?? groupsQuery.data?.items.find((group) => group.id === groupId)?.course.id ?? '';

  const studentsQuery = useQuery({
    queryKey: queryKeys.students.list({ page: 1, limit: 100, groupId, status: 'ACTIVE' }),
    queryFn: () => studentsService.list({ page: 1, limit: 100, groupId, status: 'ACTIVE' }),
    enabled: !isEdit && Boolean(groupId) && targetType !== 'GROUP',
  });
  const treeQuery = useQuery({
    queryKey: queryKeys.lessons.tree(courseId, false),
    queryFn: () => lessonsService.tree(courseId),
    enabled: Boolean(courseId),
    staleTime: 60_000,
  });
  const rubricsQuery = useQuery({ queryKey: queryKeys.homework.rubrics(false), queryFn: () => rubricsService.list(), staleTime: 60_000 });

  const topics = (treeQuery.data?.modules ?? []).flatMap((module) => module.topics.map((topic) => ({ ...topic, moduleTitle: module.title })));
  const lessons = topics.find((topic) => topic.id === topicId)?.lessons ?? [];

  const toggleStudent = (id: string) => {
    setStudentIds((current) => {
      if (targetType === 'INDIVIDUAL') return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const links = {
        topicId: values.topicId || null,
        lessonId: values.lessonId || null,
        difficulty: (values.difficulty || null) as Difficulty | null,
        rubricId: values.rubricId || null,
      };
      const payload = {
        title: values.title,
        ...(values.description ? { description: values.description } : {}),
        deadline: new Date(values.deadline).toISOString(),
        maxPoints: Number(values.maxPoints),
        xpReward: Number(values.xpReward),
        status: values.status,
        ...links,
      };
      if (homework) return homeworkService.update(homework.id, payload);
      return homeworkService.create({
        ...payload,
        groupId: values.groupId,
        targetType: values.targetType,
        ...(values.targetType === 'GROUP' ? {} : { studentIds }),
      });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['title', 'groupId', 'deadline', 'maxPoints', 'xpReward', 'topicId', 'lessonId', 'rubricId'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    if (!isEdit && values.targetType !== 'GROUP' && studentIds.length === 0) {
      setFormError('Kamida bitta o‘quvchini tanlang');
      return;
    }
    save.mutate(values);
  });

  return (
    <Modal
      open
      size="lg"
      title={isEdit ? 'Uy vazifasini tahrirlash' : 'Yangi uy vazifasi'}
      description={isEdit ? `${homework?.group.name} guruhi · ${HOMEWORK_TARGET_LABELS[homework!.targetType]}` : 'E’lon qilinganda tanlangan o‘quvchilarga ochiladi va xabar ketadi'}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Guruh" htmlFor="hw-group" error={errors.groupId?.message} required>
              <Select
                id="hw-group"
                invalid={Boolean(errors.groupId)}
                aria-describedby={errors.groupId ? fieldErrorId('hw-group') : undefined}
                disabled={groupsQuery.isPending}
                {...register('groupId', {
                  onChange: () => {
                    setStudentIds([]);
                    setValue('topicId', '');
                    setValue('lessonId', '');
                  },
                })}
              >
                <option value="">Tanlang…</option>
                {(groupsQuery.data?.items ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.course.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Kimga" htmlFor="hw-target">
              <Select id="hw-target" {...register('targetType', { onChange: () => setStudentIds([]) })}>
                {HOMEWORK_TARGET_ORDER.map((target) => (
                  <option key={target} value={target}>
                    {HOMEWORK_TARGET_LABELS[target]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        {!isEdit && targetType !== 'GROUP' && groupId && (
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-fg">
              {targetType === 'INDIVIDUAL' ? 'O‘quvchini tanlang' : `O‘quvchilarni tanlang (${studentIds.length})`}
            </legend>
            {studentsQuery.isPending ? (
              <p className="text-sm text-fg-muted">Yuklanmoqda…</p>
            ) : (studentsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-fg-muted">Guruhda faol o‘quvchi yo‘q</p>
            ) : (
              <ul className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                {studentsQuery.data!.items.map((student) => (
                  <li key={student.id}>
                    <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-fg hover:bg-surface-muted">
                      <Checkbox checked={studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                      {student.firstName} {student.lastName}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
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
          <FormField label="Qiyinlik" htmlFor="hw-difficulty">
            <Select id="hw-difficulty" {...register('difficulty')}>
              <option value="">—</option>
              {DIFFICULTY_ORDER.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABELS[difficulty]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Mavzu (kurs dasturi)" htmlFor="hw-topic" error={errors.topicId?.message}>
            <Select id="hw-topic" disabled={!courseId || topics.length === 0} {...register('topicId', { onChange: () => setValue('lessonId', '') })}>
              <option value="">{topics.length === 0 ? 'Dastur yo‘q' : '—'}</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.moduleTitle} · {topic.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Dars" htmlFor="hw-lesson" error={errors.lessonId?.message}>
            <Select id="hw-lesson" disabled={lessons.length === 0} {...register('lessonId')}>
              <option value="">—</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Rubrika" htmlFor="hw-rubric" error={errors.rubricId?.message} hint="Baholash mezonlari">
            <Select id="hw-rubric" {...register('rubricId')}>
              <option value="">Oddiy ball</option>
              {(rubricsQuery.data ?? []).map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="Tavsif" htmlFor="hw-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Textarea id="hw-description" rows={3} placeholder="Nima qilish kerakligini yozing" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
