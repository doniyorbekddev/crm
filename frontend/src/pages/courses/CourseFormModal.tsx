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
import { coursesService } from '@/services/courses.service';
import { groupsService } from '@/services/groups.service';
import type { CourseItem, CoursePayload } from '@/types/course';
import {
  COURSE_CATEGORY_LABELS,
  COURSE_CATEGORY_ORDER,
  COURSE_STATUS_LABELS,
  COURSE_STATUS_ORDER,
} from '@/utils/courseLabels';
import { formatMoney } from '@/utils/format';

const numberField = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .refine((value) => /^\d{1,9}$/.test(value), 'Faqat raqam kiriting');

const courseFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Kamida 2 belgi').max(150, 'Nom juda uzun'),
    category: z.enum(['PROGRAMMING', 'LANGUAGE', 'DESIGN', 'COMPUTER_LITERACY', 'SCHOOL_PREPARATION', 'OTHER']),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
    durationMonths: numberField('Davomiylikni kiriting'),
    price: numberField('Narxni kiriting'),
    discountAmount: z.string().trim().refine((value) => value === '' || /^\d{1,9}$/.test(value), 'Faqat raqam kiriting'),
    teacherId: z.string(),
    description: z.string().trim().max(2000, 'Tavsif juda uzun'),
  })
  .refine((values) => Number(values.discountAmount || 0) <= Number(values.price || 0), {
    path: ['discountAmount'],
    message: 'Chegirma kurs narxidan katta bo‘lmasligi kerak',
  });

type CourseFormValues = z.infer<typeof courseFormSchema>;

function toPayload(values: CourseFormValues): CoursePayload {
  return {
    name: values.name,
    category: values.category,
    status: values.status,
    durationMonths: Number(values.durationMonths),
    price: Number(values.price),
    discountAmount: Number(values.discountAmount || 0),
    ...(values.teacherId ? { teacherId: values.teacherId } : {}),
    ...(values.description ? { description: values.description } : {}),
  };
}

interface CourseFormModalProps {
  course?: CourseItem;
  onClose: () => void;
  onSaved: () => void;
}

export function CourseFormModal({ course, onClose, onSaved }: CourseFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.groupForm,
    queryFn: groupsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const defaultValues: CourseFormValues = {
    name: course?.name ?? '',
    category: course?.category ?? 'OTHER',
    status: course?.status ?? 'ACTIVE',
    durationMonths: course ? String(course.durationMonths) : '6',
    price: course ? String(course.price) : '',
    discountAmount: course && course.discountAmount > 0 ? String(course.discountAmount) : '',
    teacherId: course?.teacher?.id ?? '',
    description: course?.description ?? '',
  };

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(courseFormSchema), defaultValues });

  const price = useWatch({ control, name: 'price' });
  const discount = useWatch({ control, name: 'discountAmount' });
  const finalPrice = Math.max(Number(price || 0) - Number(discount || 0), 0);

  const save = useMutation({
    mutationFn: (values: CourseFormValues) => {
      const payload = toPayload(values);
      return course ? coursesService.update(course.id, payload) : coursesService.create(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['name', 'price', 'discountAmount', 'durationMonths', 'teacherId'])) {
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
      title={course ? 'Kursni tahrirlash' : 'Yangi kurs'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="course-form" loading={save.isPending}>
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
      <form id="course-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField label="Kurs nomi" htmlFor="course-name" error={errors.name?.message} required>
            <Input
              id="course-name"
              autoFocus
              placeholder="Masalan: Frontend"
              invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? fieldErrorId('course-name') : undefined}
              {...register('name')}
            />
          </FormField>
        </div>

        <FormField label="Yo‘nalish" htmlFor="course-category">
          <Select id="course-category" {...register('category')}>
            {COURSE_CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {COURSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Holat" htmlFor="course-status" hint="Faqat faol kurslar formalarda tanlanadi">
          <Select id="course-status" {...register('status')}>
            {COURSE_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {COURSE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Davomiyligi (oy)" htmlFor="course-duration" error={errors.durationMonths?.message} required>
          <Input id="course-duration" type="number" min={1} max={60} invalid={Boolean(errors.durationMonths)} {...register('durationMonths')} />
        </FormField>
        <FormField label="O‘qituvchi" htmlFor="course-teacher" error={errors.teacherId?.message}>
          <Select id="course-teacher" {...register('teacherId')}>
            <option value="">Tanlanmagan</option>
            {lookupsQuery.data?.teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.firstName} {teacher.lastName}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Kurs narxi (so‘m)" htmlFor="course-price" error={errors.price?.message} required>
          <Input id="course-price" type="number" min={0} step={50000} invalid={Boolean(errors.price)} {...register('price')} />
        </FormField>
        <FormField label="Chegirma (so‘m)" htmlFor="course-discount" error={errors.discountAmount?.message}>
          <Input id="course-discount" type="number" min={0} step={50000} invalid={Boolean(errors.discountAmount)} {...register('discountAmount')} />
        </FormField>

        <div className="rounded-lg bg-surface-muted px-4 py-3 sm:col-span-2">
          <p className="text-xs text-fg-muted">Yakuniy narx (shartnomaga shu narx yoziladi)</p>
          <p className="mt-1 text-lg font-semibold text-fg">{formatMoney(finalPrice)}</p>
        </div>

        <div className="sm:col-span-2">
          <FormField label="Tavsif" htmlFor="course-description" error={errors.description?.message}>
            <Textarea id="course-description" className="min-h-20" placeholder="Kurs dasturi, kimlar uchun mo‘ljallangan..." {...register('description')} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
