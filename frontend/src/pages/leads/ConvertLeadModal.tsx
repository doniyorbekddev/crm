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
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import type { ConvertLeadPayload, StudentItem } from '@/types/student';
import type { LeadDetail } from '@/types/lead';
import { formatMoney } from '@/utils/format';
import { leadFullName } from '@/utils/leadLabels';

const convertFormSchema = z.object({
  courseId: z.string().min(1, 'Kursni tanlang'),
  groupId: z.string(),
  parentPhone: z.string().trim(),
  contractNumber: z.string().trim().max(50, 'Shartnoma raqami juda uzun'),
  contractPrice: z.string().refine((value) => value === '' || /^\d{1,9}$/.test(value), 'Faqat butun son'),
  startDate: z.string().min(1, 'Boshlanish sanasini kiriting'),
});

type ConvertFormValues = z.infer<typeof convertFormSchema>;

function toPayload(values: ConvertFormValues): ConvertLeadPayload {
  return {
    courseId: values.courseId,
    startDate: values.startDate,
    ...(values.groupId ? { groupId: values.groupId } : {}),
    ...(values.parentPhone ? { parentPhone: values.parentPhone } : {}),
    ...(values.contractNumber ? { contractNumber: values.contractNumber } : {}),
    ...(values.contractPrice ? { contractPrice: Number(values.contractPrice) } : {}),
  };
}

interface ConvertLeadModalProps {
  lead: LeadDetail;
  onClose: () => void;
  onConverted: (student: StudentItem) => void;
}

export function ConvertLeadModal({ lead, onClose, onConverted }: ConvertLeadModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.studentForm,
    queryFn: studentsService.formLookups,
    staleTime: 60_000,
  });

  const defaultValues: ConvertFormValues = {
    courseId: lead.course?.id ?? '',
    groupId: '',
    parentPhone: '',
    contractNumber: '',
    contractPrice: '',
    startDate: new Date().toISOString().slice(0, 10),
  };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(convertFormSchema), defaultValues });

  const courseId = useWatch({ control, name: 'courseId' });
  const contractPrice = useWatch({ control, name: 'contractPrice' });

  const selectedCourse = lookupsQuery.data?.courses.find((course) => course.id === courseId);
  const availableGroups = (lookupsQuery.data?.groups ?? []).filter((group) => group.courseId === courseId && group.freeSeats > 0);

  const convert = useMutation({
    mutationFn: (values: ConvertFormValues) => studentsService.convertLead(lead.id, toPayload(values)),
    onSuccess: (result) => {
      toast.success(result.message);
      onConverted(result.data);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['courseId', 'groupId', 'contractNumber', 'contractPrice'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    convert.mutate(values);
  });

  return (
    <Modal
      open
      title="O‘quvchiga aylantirish"
      description={`${leadFullName(lead)} · ${lead.code}`}
      onClose={onClose}
      closeDisabled={convert.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={convert.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="convert-lead-form" loading={convert.isPending}>
            Aylantirish
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <Alert tone="info" className="mb-4">
        Lead “Sotildi” holatiga o‘tadi va shartnoma summasi bo‘yicha qarzdorlik yozuvi ochiladi.
      </Alert>
      <form id="convert-lead-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Kurs" htmlFor="convert-course" error={errors.courseId?.message} required>
          <Select
            id="convert-course"
            invalid={Boolean(errors.courseId)}
            aria-describedby={errors.courseId ? fieldErrorId('convert-course') : undefined}
            {...register('courseId', { onChange: () => setValue('groupId', '') })}
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
          htmlFor="convert-group"
          error={errors.groupId?.message}
          hint={courseId ? (availableGroups.length === 0 ? 'Bu kursda bo‘sh guruh yo‘q' : 'Ixtiyoriy') : 'Avval kursni tanlang'}
        >
          <Select id="convert-group" disabled={!courseId || availableGroups.length === 0} {...register('groupId')}>
            <option value="">Guruhsiz</option>
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.studentCount}/{group.capacity})
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Shartnoma raqami" htmlFor="convert-contractNumber" error={errors.contractNumber?.message} hint="Ixtiyoriy">
          <Input id="convert-contractNumber" placeholder="SH-2026-001" invalid={Boolean(errors.contractNumber)} {...register('contractNumber')} />
        </FormField>
        <FormField
          label="Shartnoma narxi (so‘m)"
          htmlFor="convert-contractPrice"
          error={errors.contractPrice?.message}
          hint={
            contractPrice
              ? formatMoney(Number(contractPrice))
              : selectedCourse
                ? `Bo‘sh qoldirilsa kurs narxi olinadi: ${formatMoney(selectedCourse.finalPrice)}`
                : 'Bo‘sh qoldirilsa kurs narxi olinadi'
          }
        >
          <Input id="convert-contractPrice" inputMode="numeric" invalid={Boolean(errors.contractPrice)} {...register('contractPrice')} />
        </FormField>

        <FormField label="O‘qish boshlanishi" htmlFor="convert-startDate" error={errors.startDate?.message} required>
          <Input id="convert-startDate" type="date" invalid={Boolean(errors.startDate)} {...register('startDate')} />
        </FormField>
        <FormField label="Ota-ona telefoni" htmlFor="convert-parentPhone" error={errors.parentPhone?.message} hint="Ixtiyoriy">
          <Input id="convert-parentPhone" placeholder="+998901234567" {...register('parentPhone')} />
        </FormField>
      </form>
    </Modal>
  );
}
