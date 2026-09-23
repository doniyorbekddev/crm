import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { studentsService } from '@/services/students.service';
import type { StudentItem, StudentStatus } from '@/types/student';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_ORDER } from '@/utils/studentLabels';

const STATUS_HINTS: Record<StudentStatus, string> = {
  ACTIVE: 'O‘quvchi darslarga qatnaydi va davomat jurnalida ko‘rinadi.',
  FROZEN: 'Vaqtincha to‘xtatilgan — davomat jurnalida ko‘rinmaydi.',
  COMPLETED: 'Kursni tugatgan, lekin hujjat topshirilmagan.',
  GRADUATED: 'Kursni to‘liq bitirgan.',
  ALUMNI: 'Bitirgan va markaz bilan aloqada qoladi — tavsiya va qayta yozilish uchun.',
  DROPPED: 'O‘qishni tashlab ketgan — davomat jurnalida ko‘rinmaydi.',
};

interface StudentStatusModalProps {
  student: StudentItem;
  onClose: () => void;
  onSaved: () => void;
}

export function StudentStatusModal({ student, onClose, onSaved }: StudentStatusModalProps) {
  const [status, setStatus] = useState<StudentStatus>(student.status);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => studentsService.setStatus(student.id, status, reason.trim() || undefined),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  return (
    <Modal
      open
      title="Holatni o‘zgartirish"
      description={`${student.firstName} ${student.lastName} · ${student.code}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={status === student.status}>
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
      <FormField label="Yangi holat" htmlFor="student-status" hint={STATUS_HINTS[status]}>
        <Select id="student-status" value={status} onChange={(event) => setStatus(event.target.value as StudentStatus)}>
          {STUDENT_STATUS_ORDER.map((item) => (
            <option key={item} value={item}>
              {STUDENT_STATUS_LABELS[item]}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="mt-4">
        <FormField
          label="Sabab"
          htmlFor="student-status-reason"
          hint="Ixtiyoriy, lekin tavsiya etiladi — holat tarixida va audit jurnalida saqlanadi"
        >
          <Textarea
            id="student-status-reason"
            rows={2}
            maxLength={255}
            value={reason}
            placeholder="Masalan: oilaviy sabablarga ko‘ra 2 oyga to‘xtatdi"
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
