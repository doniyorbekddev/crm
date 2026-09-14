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
import { teachersService } from '@/services/teachers.service';
import type { EmployeeStatus } from '@/types/employee';
import type { TeacherItem, TeacherProfilePayload } from '@/types/teacher';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_ORDER } from '@/utils/employeeLabels';

const schema = z.object({
  userId: z.string(),
  specialization: z.string().trim().max(150, 'Mutaxassislik juda uzun'),
  experienceYears: z
    .string()
    .refine((value) => value === '' || /^\d{1,2}$/.test(value), 'Tajriba 0–60 yil oralig‘ida bo‘lsin')
    .refine((value) => value === '' || Number(value) <= 60, 'Tajriba 60 yildan oshmasligi kerak'),
  hireDate: z.string(),
  bio: z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasligi kerak'),
  employmentStatus: z.enum(EMPLOYEE_STATUS_ORDER),
  terminationDate: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toPayload(values: FormValues): TeacherProfilePayload {
  return {
    ...(values.specialization ? { specialization: values.specialization } : {}),
    ...(values.experienceYears ? { experienceYears: Number(values.experienceYears) } : {}),
    ...(values.hireDate ? { hireDate: values.hireDate } : {}),
    ...(values.bio ? { bio: values.bio } : {}),
  };
}

interface TeacherFormModalProps {
  mode: 'create' | 'edit';
  teacher?: TeacherItem;
  onClose: () => void;
  onSaved: () => void;
}

export function TeacherFormModal({ mode, teacher, onClose, onSaved }: TeacherFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: queryKeys.teachers.candidates,
    queryFn: teachersService.candidates,
    enabled: mode === 'create',
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
      userId: '',
      specialization: teacher?.specialization ?? '',
      experienceYears: teacher?.experienceYears === null || teacher?.experienceYears === undefined ? '' : String(teacher.experienceYears),
      hireDate: teacher?.hireDate ?? '',
      bio: teacher?.bio ?? '',
      employmentStatus: (teacher?.employmentStatus ?? 'ACTIVE') as EmployeeStatus,
      terminationDate: teacher?.terminationDate ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      if (mode === 'create') {
        return teachersService.create({ userId: values.userId, ...toPayload(values) });
      }
      if (!teacher) throw new Error('O‘qituvchi topilmadi');
      return teachersService.update(teacher.id, {
        ...toPayload(values),
        employmentStatus: values.employmentStatus,
        ...(values.employmentStatus === 'RESIGNED' && values.terminationDate ? { terminationDate: values.terminationDate } : {}),
      });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['userId', 'specialization', 'experienceYears', 'hireDate', 'employmentStatus', 'terminationDate'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    if (mode === 'create' && !values.userId) {
      setError('userId', { message: 'Xodimni tanlang' });
      return;
    }
    if (mode === 'edit' && values.employmentStatus === 'RESIGNED' && !values.terminationDate) {
      setError('terminationDate', { message: 'Ishdan ketgan sanani kiriting' });
      return;
    }
    save.mutate(values);
  });

  const candidates = candidatesQuery.data ?? [];
  const employmentStatus = useWatch({ control, name: 'employmentStatus' });

  return (
    <Modal
      open
      title={mode === 'create' ? 'O‘qituvchi profilini ochish' : 'O‘qituvchi profilini tahrirlash'}
      description={
        mode === 'create'
          ? 'Dars belgilash ruxsati bor xodimlar ro‘yxatdan tanlanadi'
          : `${teacher?.user.firstName} ${teacher?.user.lastName}`
      }
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="teacher-form" loading={save.isPending}>
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

      <form id="teacher-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {mode === 'create' && (
          <FormField
            label="Xodim"
            htmlFor="teacher-userId"
            error={errors.userId?.message}
            required
            hint={
              candidatesQuery.isPending
                ? 'Yuklanmoqda…'
                : candidates.length === 0
                  ? 'Bo‘sh xodim yo‘q — avval xodimlar bo‘limida o‘qituvchi rolini bering'
                  : undefined
            }
          >
            <Select
              id="teacher-userId"
              invalid={Boolean(errors.userId)}
              aria-describedby={errors.userId ? fieldErrorId('teacher-userId') : undefined}
              disabled={candidatesQuery.isPending || candidates.length === 0}
              {...register('userId')}
            >
              <option value="">Tanlang…</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.firstName} {candidate.lastName} · {candidate.roleName}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mutaxassislik" htmlFor="teacher-specialization" error={errors.specialization?.message}>
            <Input id="teacher-specialization" placeholder="Frontend dasturlash" {...register('specialization')} />
          </FormField>
          <FormField label="Tajriba (yil)" htmlFor="teacher-experience" error={errors.experienceYears?.message}>
            <Input id="teacher-experience" inputMode="numeric" placeholder="4" {...register('experienceYears')} />
          </FormField>
          <FormField label="Ishga olingan sana" htmlFor="teacher-hireDate" error={errors.hireDate?.message}>
            <Input id="teacher-hireDate" type="date" {...register('hireDate')} />
          </FormField>
          {mode === 'edit' && (
            <FormField label="Holat" htmlFor="teacher-status" error={errors.employmentStatus?.message} hint="Faol va ta’tildagi o‘qituvchi guruh va maosh uchun faol hisoblanadi">
              <Select id="teacher-status" {...register('employmentStatus')}>
                {EMPLOYEE_STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {EMPLOYEE_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {mode === 'edit' && employmentStatus === 'RESIGNED' && (
            <FormField label="Ishdan ketgan sana" htmlFor="teacher-terminationDate" error={errors.terminationDate?.message} required>
              <Input id="teacher-terminationDate" type="date" {...register('terminationDate')} />
            </FormField>
          )}
        </div>

        <FormField label="Izoh" htmlFor="teacher-bio" error={errors.bio?.message} hint="Ixtiyoriy — qisqa tavsif">
          <Textarea id="teacher-bio" rows={3} {...register('bio')} />
        </FormField>
      </form>
    </Modal>
  );
}
