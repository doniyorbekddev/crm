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
import { studentsService } from '@/services/students.service';
import type { StudentItem, StudentPayload } from '@/types/student';
import { formatMoney } from '@/utils/format';

const studentFormSchema = z.object({
  firstName: z.string().trim().min(2, 'Kamida 2 belgi').max(100, 'Ism juda uzun'),
  lastName: z.string().trim().min(2, 'Kamida 2 belgi').max(100, 'Familiya juda uzun'),
  phone: z.string().trim().min(7, 'Telefon raqamni kiriting'),
  parentPhone: z.string().trim(),
  telegram: z.string().trim().max(64, 'Juda uzun'),
  email: z.string().trim(),
  birthDate: z.string(),
  gender: z.enum(['', 'MALE', 'FEMALE']),
  address: z.string().trim().max(255, 'Manzil juda uzun'),
  courseId: z.string().min(1, 'Kursni tanlang'),
  groupId: z.string(),
  contractNumber: z.string().trim().max(50, 'Shartnoma raqami juda uzun'),
  contractPrice: z.string().refine((value) => value === '' || /^\d{1,9}$/.test(value), 'Faqat butun son'),
  startDate: z.string().min(1, 'Boshlanish sanasini kiriting'),
  notes: z.string().trim().max(2000, 'Izoh juda uzun'),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

function toPayload(values: StudentFormValues): StudentPayload {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    courseId: values.courseId,
    startDate: values.startDate,
    ...(values.parentPhone ? { parentPhone: values.parentPhone } : {}),
    ...(values.telegram ? { telegram: values.telegram } : {}),
    ...(values.email ? { email: values.email } : {}),
    ...(values.birthDate ? { birthDate: values.birthDate } : {}),
    ...(values.gender ? { gender: values.gender } : {}),
    ...(values.address ? { address: values.address } : {}),
    ...(values.groupId ? { groupId: values.groupId } : {}),
    ...(values.contractNumber ? { contractNumber: values.contractNumber } : {}),
    ...(values.contractPrice ? { contractPrice: Number(values.contractPrice) } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
  };
}

interface StudentFormModalProps {
  student?: StudentItem;
  onClose: () => void;
  onSaved: () => void;
}

export function StudentFormModal({ student, onClose, onSaved }: StudentFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.studentForm,
    queryFn: studentsService.formLookups,
    staleTime: 60_000,
  });

  const defaultValues: StudentFormValues = {
    firstName: student?.firstName ?? '',
    lastName: student?.lastName ?? '',
    phone: student?.phone ?? '',
    parentPhone: student?.parentPhone ?? '',
    telegram: student?.telegram ?? '',
    email: student?.email ?? '',
    birthDate: student?.birthDate ?? '',
    gender: student?.gender ?? '',
    address: student?.address ?? '',
    courseId: student?.course.id ?? '',
    groupId: student?.group?.id ?? '',
    contractNumber: student?.contractNumber ?? '',
    contractPrice: student ? String(student.contractPrice) : '',
    startDate: student?.startDate ?? new Date().toISOString().slice(0, 10),
    notes: student?.notes ?? '',
  };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(studentFormSchema), defaultValues });

  const courseId = useWatch({ control, name: 'courseId' });
  const contractPrice = useWatch({ control, name: 'contractPrice' });

  const selectedCourse = lookupsQuery.data?.courses.find((course) => course.id === courseId);
  // Guruh faqat tanlangan kursga tegishli bo‘lishi mumkin
  const availableGroups = (lookupsQuery.data?.groups ?? []).filter(
    (group) => group.courseId === courseId && (group.freeSeats > 0 || group.id === student?.group?.id),
  );

  const save = useMutation({
    mutationFn: (values: StudentFormValues) => {
      const payload = toPayload(values);
      return student ? studentsService.update(student.id, payload) : studentsService.create(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['firstName', 'lastName', 'phone', 'courseId', 'groupId', 'contractNumber', 'contractPrice'])) {
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
      title={student ? 'O‘quvchini tahrirlash' : 'Yangi o‘quvchi'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="student-form" loading={save.isPending}>
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
      <form id="student-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Ism" htmlFor="student-firstName" error={errors.firstName?.message} required>
          <Input id="student-firstName" autoFocus invalid={Boolean(errors.firstName)} {...register('firstName')} />
        </FormField>
        <FormField label="Familiya" htmlFor="student-lastName" error={errors.lastName?.message} required>
          <Input id="student-lastName" invalid={Boolean(errors.lastName)} {...register('lastName')} />
        </FormField>

        <FormField label="Telefon" htmlFor="student-phone" error={errors.phone?.message} required>
          <Input id="student-phone" placeholder="+998901234567" invalid={Boolean(errors.phone)} {...register('phone')} />
        </FormField>
        <FormField label="Ota-ona telefoni" htmlFor="student-parentPhone" error={errors.parentPhone?.message} hint="Ixtiyoriy">
          <Input id="student-parentPhone" placeholder="+998901234567" {...register('parentPhone')} />
        </FormField>

        <FormField label="Kurs" htmlFor="student-course" error={errors.courseId?.message} required>
          <Select
            id="student-course"
            invalid={Boolean(errors.courseId)}
            aria-describedby={errors.courseId ? fieldErrorId('student-course') : undefined}
            {...register('courseId', {
              onChange: () => setValue('groupId', ''),
            })}
          >
            <option value="">Kursni tanlang</option>
            {lookupsQuery.data?.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} — {formatMoney(course.finalPrice)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Guruh"
          htmlFor="student-group"
          error={errors.groupId?.message}
          hint={courseId ? (availableGroups.length === 0 ? 'Bu kursda bo‘sh guruh yo‘q' : 'Ixtiyoriy') : 'Avval kursni tanlang'}
        >
          <Select id="student-group" disabled={!courseId || availableGroups.length === 0} {...register('groupId')}>
            <option value="">Guruhsiz</option>
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.studentCount}/{group.capacity})
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Shartnoma raqami" htmlFor="student-contractNumber" error={errors.contractNumber?.message} hint="Ixtiyoriy">
          <Input id="student-contractNumber" placeholder="SH-2026-001" invalid={Boolean(errors.contractNumber)} {...register('contractNumber')} />
        </FormField>
        <FormField
          label="Shartnoma narxi (so‘m)"
          htmlFor="student-contractPrice"
          error={errors.contractPrice?.message}
          hint={
            contractPrice
              ? formatMoney(Number(contractPrice))
              : selectedCourse
                ? `Bo‘sh qoldirilsa kurs narxi olinadi: ${formatMoney(selectedCourse.finalPrice)}`
                : 'Bo‘sh qoldirilsa kurs narxi olinadi'
          }
        >
          <Input id="student-contractPrice" inputMode="numeric" invalid={Boolean(errors.contractPrice)} {...register('contractPrice')} />
        </FormField>

        <FormField label="O‘qish boshlanishi" htmlFor="student-startDate" error={errors.startDate?.message} required>
          <Input id="student-startDate" type="date" invalid={Boolean(errors.startDate)} {...register('startDate')} />
        </FormField>
        <FormField label="Tug‘ilgan sana" htmlFor="student-birthDate" error={errors.birthDate?.message} hint="Ixtiyoriy">
          <Input id="student-birthDate" type="date" {...register('birthDate')} />
        </FormField>

        <FormField label="Jins" htmlFor="student-gender">
          <Select id="student-gender" {...register('gender')}>
            <option value="">Tanlanmagan</option>
            <option value="MALE">Erkak</option>
            <option value="FEMALE">Ayol</option>
          </Select>
        </FormField>
        <FormField label="Telegram" htmlFor="student-telegram" error={errors.telegram?.message} hint="Ixtiyoriy">
          <Input id="student-telegram" placeholder="@username" {...register('telegram')} />
        </FormField>

        <FormField label="Email" htmlFor="student-email" error={errors.email?.message} hint="Ixtiyoriy">
          <Input id="student-email" type="email" {...register('email')} />
        </FormField>
        <FormField label="Manzil" htmlFor="student-address" error={errors.address?.message} hint="Ixtiyoriy">
          <Input id="student-address" {...register('address')} />
        </FormField>

        <div className="sm:col-span-2">
          <FormField label="Izoh" htmlFor="student-notes" error={errors.notes?.message} hint="Ixtiyoriy">
            <Textarea id="student-notes" rows={3} {...register('notes')} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
