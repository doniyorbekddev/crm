import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { groupsService } from '@/services/groups.service';
import { roomsService } from '@/services/rooms.service';
import type { GroupItem, GroupPayload, WeekDay } from '@/types/group';
import { GROUP_STATUS_LABELS, GROUP_STATUS_ORDER, WEEK_DAY_LABELS, WEEK_DAY_ORDER } from '@/utils/courseLabels';

/** O‘quv markazlarda odatiy jadval: toq va juft kunlar */
const SCHEDULE_PRESETS: ReadonlyArray<{ label: string; days: WeekDay[] }> = [
  { label: 'Toq kunlar', days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'] },
  { label: 'Juft kunlar', days: ['TUESDAY', 'THURSDAY', 'SATURDAY'] },
  { label: 'Har kuni', days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] },
];

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const groupFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Kamida 2 belgi').max(100, 'Nom juda uzun'),
    courseId: z.string().min(1, 'Kursni tanlang'),
    teacherId: z.string(),
    roomId: z.string(),
    startDate: z.string().min(1, 'Boshlanish sanasini kiriting'),
    endDate: z.string(),
    scheduleDays: z.array(z.enum(WEEK_DAY_ORDER)).min(1, 'Kamida bitta dars kunini tanlang'),
    startTime: z.string().regex(timePattern, 'Vaqt formati: 09:00'),
    endTime: z.string().regex(timePattern, 'Vaqt formati: 09:00'),
    capacity: z.string().refine((value) => /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 100, 'Sig‘im 1–100 oralig‘ida'),
    status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
  })
  .refine((values) => values.endTime > values.startTime, {
    path: ['endTime'],
    message: 'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak',
  })
  .refine((values) => !values.endDate || values.endDate >= values.startDate, {
    path: ['endDate'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

type GroupFormValues = z.infer<typeof groupFormSchema>;

function toPayload(values: GroupFormValues): GroupPayload {
  return {
    name: values.name,
    courseId: values.courseId,
    startDate: values.startDate,
    scheduleDays: values.scheduleDays,
    startTime: values.startTime,
    endTime: values.endTime,
    capacity: Number(values.capacity),
    status: values.status,
    ...(values.teacherId ? { teacherId: values.teacherId } : {}),
    ...(values.roomId ? { roomId: values.roomId } : {}),
    ...(values.endDate ? { endDate: values.endDate } : {}),
  };
}

interface GroupFormModalProps {
  group?: GroupItem;
  onClose: () => void;
  onSaved: () => void;
}

export function GroupFormModal({ group, onClose, onSaved }: GroupFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.groupForm,
    queryFn: groupsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const defaultValues: GroupFormValues = {
    name: group?.name ?? '',
    courseId: group?.course.id ?? '',
    teacherId: group?.teacher?.id ?? '',
    roomId: group?.roomRef?.id ?? '',
    startDate: group?.startDate ?? '',
    endDate: group?.endDate ?? '',
    scheduleDays: group?.scheduleDays ?? ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    startTime: group?.startTime ?? '14:00',
    endTime: group?.endTime ?? '16:00',
    capacity: group ? String(group.capacity) : '15',
    status: group?.status ?? 'PLANNED',
  };

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(groupFormSchema), defaultValues });

  const roomsQuery = useQuery({
    queryKey: queryKeys.rooms.list(false),
    queryFn: () => roomsService.list(),
    staleTime: 5 * 60_000,
  });

  // Jadval to'qnashuvini saqlashdan oldin ko'rsatamiz — xodim xatoni formada bilib oladi
  const [roomId, teacherId, scheduleDays, startTime, endTime, startDate, endDate] = watch([
    'roomId',
    'teacherId',
    'scheduleDays',
    'startTime',
    'endTime',
    'startDate',
    'endDate',
  ]);
  const conflictInput =
    (roomId || teacherId) && scheduleDays.length > 0 && timePattern.test(startTime) && timePattern.test(endTime) && startDate
      ? {
          ...(group ? { groupId: group.id } : {}),
          ...(roomId ? { roomId } : {}),
          ...(teacherId ? { teacherId } : {}),
          scheduleDays,
          startTime,
          endTime,
          startDate,
          ...(endDate ? { endDate } : {}),
        }
      : null;
  const conflictsQuery = useQuery({
    queryKey: ['rooms', 'conflicts', conflictInput],
    queryFn: () => roomsService.checkConflicts(conflictInput!),
    enabled: conflictInput !== null,
    staleTime: 10_000,
  });
  const conflicts = conflictsQuery.data ?? [];

  const save = useMutation({
    mutationFn: (values: GroupFormValues) => {
      const payload = toPayload(values);
      return group ? groupsService.update(group.id, payload) : groupsService.create(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['name', 'courseId', 'teacherId', 'capacity', 'startTime', 'endTime', 'endDate'])) {
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
      title={group ? 'Guruhni tahrirlash' : 'Yangi guruh'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="group-form" loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      {conflicts.length > 0 && (
        <Alert tone="warning" className="mb-4">
          <p className="font-medium">Jadvalda to‘qnashuv bor:</p>
          <ul className="mt-1 list-disc pl-4">
            {conflicts.map((conflict) => (
              <li key={`${conflict.kind}-${conflict.groupId}`}>{conflict.message}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Saqlash uchun vaqtni yoki xonani o‘zgartiring.</p>
        </Alert>
      )}
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <form id="group-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Guruh nomi" htmlFor="group-name" error={errors.name?.message} required>
          <Input id="group-name" autoFocus placeholder="Masalan: FE-01" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="Kurs" htmlFor="group-course" error={errors.courseId?.message} required>
          <Select id="group-course" invalid={Boolean(errors.courseId)} aria-describedby={errors.courseId ? fieldErrorId('group-course') : undefined} {...register('courseId')}>
            <option value="">Kursni tanlang</option>
            {lookupsQuery.data?.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="O‘qituvchi" htmlFor="group-teacher" error={errors.teacherId?.message}>
          <Select id="group-teacher" {...register('teacherId')}>
            <option value="">Tanlanmagan</option>
            {lookupsQuery.data?.teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.firstName} {teacher.lastName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Xona" htmlFor="group-room" error={errors.roomId?.message} hint="Band qilish to‘qnashuvi avtomatik tekshiriladi">
          <Select id="group-room" {...register('roomId')}>
            <option value="">Xona tanlanmagan</option>
            {(roomsQuery.data ?? []).map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.capacity} o‘rin)
              </option>
            ))}
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          <FormField label="Dars kunlari" htmlFor="group-days" error={errors.scheduleDays?.message} required>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setValue('scheduleDays', preset.days, { shouldValidate: true })}
                    className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div id="group-days" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEEK_DAY_ORDER.map((day) => (
                  <label key={day} className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox value={day} {...register('scheduleDays')} />
                    {WEEK_DAY_LABELS[day]}
                  </label>
                ))}
              </div>
            </div>
          </FormField>
        </div>

        <FormField label="Dars boshlanishi" htmlFor="group-startTime" error={errors.startTime?.message} required>
          <Input id="group-startTime" type="time" invalid={Boolean(errors.startTime)} {...register('startTime')} />
        </FormField>
        <FormField label="Dars tugashi" htmlFor="group-endTime" error={errors.endTime?.message} required>
          <Input id="group-endTime" type="time" invalid={Boolean(errors.endTime)} {...register('endTime')} />
        </FormField>

        <FormField label="Boshlanish sanasi" htmlFor="group-startDate" error={errors.startDate?.message} required>
          <Input id="group-startDate" type="date" invalid={Boolean(errors.startDate)} {...register('startDate')} />
        </FormField>
        <FormField label="Tugash sanasi" htmlFor="group-endDate" error={errors.endDate?.message} hint="Ixtiyoriy">
          <Input id="group-endDate" type="date" invalid={Boolean(errors.endDate)} {...register('endDate')} />
        </FormField>

        <FormField label="Sig‘im (o‘rin)" htmlFor="group-capacity" error={errors.capacity?.message} required>
          <Input id="group-capacity" type="number" min={1} max={100} invalid={Boolean(errors.capacity)} {...register('capacity')} />
        </FormField>
        <FormField label="Holat" htmlFor="group-status">
          <Select id="group-status" {...register('status')}>
            {GROUP_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {GROUP_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Modal>
  );
}
