import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import type { PermissionRequest, PermissionRequestInput, PermissionRequestType } from '@/types/staffAttendance';
import type { ApiSuccessResponse } from '@/types/api';
import { REQUEST_TYPE_LABELS, tashkentDate } from '@/utils/staffAttendanceLabels';

/**
 * Ruxsat so'rovi: kelmaslik (bir yoki bir necha kun), kech kelish yoki erta ketish.
 * Xodim o'zi uchun yuboradi (rahbar tasdiqlaydi); rahbar xodim nomidan yozsa — darhol tasdiqlangan bo'ladi.
 */
export function PermissionRequestModal({
  title,
  description,
  submitLabel,
  onSubmit,
  onClose,
  onSaved,
}: {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (input: PermissionRequestInput) => Promise<ApiSuccessResponse<PermissionRequest>>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<PermissionRequestType>('ABSENCE');
  const [startDate, setStartDate] = useState(tashkentDate());
  const [endDate, setEndDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');

  const save = useMutation({
    mutationFn: () =>
      onSubmit({
        type,
        startDate,
        ...(type === 'ABSENCE' && endDate ? { endDate } : {}),
        ...(type !== 'ABSENCE' && time ? { time } : {}),
        reason: reason.trim(),
      }),
    onSuccess: (response) => {
      toast.success(response.message);
      onSaved();
      onClose();
    },
  });
  const fieldError = (field: string) => getFieldErrors(save.error).find((item) => item.field === field)?.message;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={reason.trim().length < 3 || !startDate}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.isError && getFieldErrors(save.error).length === 0 && <Alert tone="error">{getErrorMessage(save.error)}</Alert>}
        <FormField label="So‘rov turi" htmlFor="request-type">
          <Select id="request-type" value={type} onChange={(event) => setType(event.target.value as PermissionRequestType)}>
            {(Object.keys(REQUEST_TYPE_LABELS) as PermissionRequestType[]).map((key) => (
              <option key={key} value={key}>
                {REQUEST_TYPE_LABELS[key]}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={type === 'ABSENCE' ? 'Qaysi kundan' : 'Sana'} htmlFor="request-start" error={fieldError('startDate')} required>
            <Input id="request-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </FormField>
          {type === 'ABSENCE' ? (
            <FormField label="Qaysi kungacha" htmlFor="request-end" error={fieldError('endDate')} hint="Bir kun bo‘lsa — bo‘sh qoldiring">
              <Input id="request-end" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </FormField>
          ) : (
            <FormField label={type === 'LATE_ARRIVAL' ? 'Soat nechagacha kelasiz' : 'Soat nechada ketasiz'} htmlFor="request-time" error={fieldError('time')} required>
              <Input id="request-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </FormField>
          )}
        </div>
        <FormField label="Sabab" htmlFor="request-reason" error={fieldError('reason')} required>
          <Textarea id="request-reason" rows={3} maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Masalan: shifokor qabuli" />
        </FormField>
      </div>
    </Modal>
  );
}
