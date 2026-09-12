import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
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
import { callsService } from '@/services/calls.service';
import type { CallItem, CallPayload } from '@/types/call';
import { CALL_DIRECTION_LABELS, CALL_RESULT_LABELS, CALL_RESULT_ORDER, CALL_STATUS_LABELS } from '@/utils/callLabels';
import { fromDateTimeInputValue, toDateTimeInputValue } from '@/utils/format';

const callFormSchema = z.object({
  direction: z.enum(['OUTGOING', 'INCOMING']),
  status: z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']),
  result: z.enum(['', 'ANSWERED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'INTERESTED', 'NOT_INTERESTED', 'CALLBACK']),
  calledAt: z.string().min(1, 'Qo‘ng‘iroq vaqtini kiriting'),
  durationMinutes: z.string().refine((value) => value === '' || /^\d{1,4}$/.test(value), 'Faqat raqam kiriting'),
  notes: z.string().trim().max(2000, 'Izoh 2000 belgidan oshmasligi kerak'),
  nextCallAt: z.string(),
});

type CallFormValues = z.infer<typeof callFormSchema>;

function toPayload(values: CallFormValues): CallPayload {
  const calledAt = fromDateTimeInputValue(values.calledAt);
  const nextCallAt = fromDateTimeInputValue(values.nextCallAt);
  return {
    direction: values.direction,
    status: values.status,
    durationSec: values.durationMinutes ? Number(values.durationMinutes) * 60 : 0,
    ...(values.result ? { result: values.result } : {}),
    ...(calledAt ? { calledAt } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
    ...(nextCallAt ? { nextCallAt } : {}),
  };
}

interface CallFormModalProps {
  leadId: string;
  call?: CallItem;
  onClose: () => void;
  onSaved: () => void;
}

export function CallFormModal({ leadId, call, onClose, onSaved }: CallFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const defaultValues: CallFormValues = {
    direction: call?.direction ?? 'OUTGOING',
    status: call?.status ?? 'COMPLETED',
    result: call?.result ?? '',
    calledAt: toDateTimeInputValue(call?.calledAt ?? new Date()),
    durationMinutes: call && call.durationSec > 0 ? String(Math.round(call.durationSec / 60)) : '',
    notes: call?.notes ?? '',
    nextCallAt: toDateTimeInputValue(call?.nextCallAt ?? null),
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(callFormSchema), defaultValues });

  const save = useMutation({
    mutationFn: (values: CallFormValues) => {
      const payload = toPayload(values);
      return call ? callsService.update(call.id, payload) : callsService.create({ ...payload, leadId });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  return (
    <Modal
      open
      title={call ? 'Qo‘ng‘iroqni tahrirlash' : 'Qo‘ng‘iroq yozish'}
      description={call ? undefined : 'Mijoz bilan bo‘lgan suhbat natijasini yozib qo‘ying'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="call-form" loading={save.isPending}>
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
      <form id="call-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Natija" htmlFor="call-result">
          <Select id="call-result" {...register('result')}>
            <option value="">Tanlanmagan</option>
            {CALL_RESULT_ORDER.map((result) => (
              <option key={result} value={result}>
                {CALL_RESULT_LABELS[result]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Yo‘nalish" htmlFor="call-direction">
          <Select id="call-direction" {...register('direction')}>
            <option value="OUTGOING">{CALL_DIRECTION_LABELS.OUTGOING}</option>
            <option value="INCOMING">{CALL_DIRECTION_LABELS.INCOMING}</option>
          </Select>
        </FormField>
        <FormField label="Vaqti" htmlFor="call-calledAt" error={errors.calledAt?.message} required>
          <Input
            id="call-calledAt"
            type="datetime-local"
            invalid={Boolean(errors.calledAt)}
            aria-describedby={errors.calledAt ? fieldErrorId('call-calledAt') : undefined}
            {...register('calledAt')}
          />
        </FormField>
        <FormField label="Davomiyligi (daqiqa)" htmlFor="call-duration" error={errors.durationMinutes?.message}>
          <Input id="call-duration" inputMode="numeric" placeholder="0" invalid={Boolean(errors.durationMinutes)} {...register('durationMinutes')} />
        </FormField>
        <FormField label="Holat" htmlFor="call-status">
          <Select id="call-status" {...register('status')}>
            {(['COMPLETED', 'PLANNED', 'CANCELLED'] as const).map((status) => (
              <option key={status} value={status}>
                {CALL_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Keyingi qo‘ng‘iroq"
          htmlFor="call-nextCallAt"
          hint="To‘ldirilsa, shu vaqtga follow-up yaratiladi"
        >
          <Input id="call-nextCallAt" type="datetime-local" {...register('nextCallAt')} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Izoh" htmlFor="call-notes" error={errors.notes?.message}>
            <Textarea id="call-notes" className="min-h-20" placeholder="Mijoz nima dedi, nimaga kelishildi..." {...register('notes')} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
