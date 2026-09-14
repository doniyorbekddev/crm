import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import type { StudentItem } from '@/types/student';

/** Select qiymati: o‘quvchini guruhdan chiqarish */
const REMOVE_FROM_GROUP = '__remove__';

interface TransferGroupModalProps {
  student: StudentItem;
  onClose: () => void;
  onSaved: () => void;
}

export function TransferGroupModal({ student, onClose, onSaved }: TransferGroupModalProps) {
  const [groupId, setGroupId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.studentForm,
    queryFn: studentsService.formLookups,
    staleTime: 60_000,
  });
  // Faqat shu kursning boshqa ochiq guruhlari (kursni almashtirish shartnomani o'zgartiradi — tahrirlash orqali)
  const groups = (lookupsQuery.data?.groups ?? []).filter((group) => group.courseId === student.course.id && group.id !== student.group?.id);

  const save = useMutation({
    mutationFn: () =>
      studentsService.transferGroup(student.id, {
        groupId: groupId === REMOVE_FROM_GROUP ? null : groupId,
        reason: reason.trim(),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const canSave = groupId !== '' && reason.trim().length >= 3;

  return (
    <Modal
      open
      title="Guruhga o‘tkazish"
      description={`${student.firstName} ${student.lastName} · ${student.code} · hozir: ${student.group?.name ?? 'guruhsiz'}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button
            variant={groupId === REMOVE_FROM_GROUP ? 'danger' : 'primary'}
            loading={save.isPending}
            disabled={!canSave}
            onClick={() => {
              setFormError(null);
              save.mutate();
            }}
          >
            {groupId === REMOVE_FROM_GROUP ? 'Guruhdan chiqarish' : 'O‘tkazish'}
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      {lookupsQuery.isError && (
        <Alert tone="error" className="mb-4">
          {getErrorMessage(lookupsQuery.error)}
        </Alert>
      )}

      <div className="space-y-4">
        <FormField label="Yangi guruh" htmlFor="transfer-group" hint={`«${student.course.name}» kursining ochiq guruhlari`} required>
          <Select id="transfer-group" value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={lookupsQuery.isPending}>
            <option value="">Tanlang…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id} disabled={group.freeSeats <= 0}>
                {group.name} · {group.freeSeats > 0 ? `${group.freeSeats} ta bo‘sh o‘rin` : 'to‘lgan'}
              </option>
            ))}
            {student.group && <option value={REMOVE_FROM_GROUP}>Guruhdan chiqarish</option>}
          </Select>
        </FormField>
        {lookupsQuery.isSuccess && groups.length === 0 && (
          <p className="text-sm text-fg-muted">Bu kursda boshqa ochiq guruh yo‘q — avval yangi guruh oching.</p>
        )}

        <FormField label="Sabab" htmlFor="transfer-reason" hint="Guruh tarixida saqlanadi" required>
          <Textarea
            id="transfer-reason"
            rows={3}
            maxLength={255}
            placeholder="Masalan: dars vaqti to‘g‘ri kelmadi"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>

        {groupId === REMOVE_FROM_GROUP && (
          <Alert tone="warning">O‘quvchi guruhsiz qoladi va davomat jurnalida ko‘rinmaydi. Shartnoma va to‘lovlar o‘zgarmaydi.</Alert>
        )}
      </div>
    </Modal>
  );
}
