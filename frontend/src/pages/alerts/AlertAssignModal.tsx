import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { alertsService } from '@/services/alerts.service';
import type { Alert } from '@/types/alert';

interface AlertAssignModalProps {
  alert: Alert;
  onClose: () => void;
  onDone: () => void;
}

/** Ogohlantirishga mas'ul belgilash yoki olib tashlash (`task.assign`) */
export function AlertAssignModal({ alert, onClose, onDone }: AlertAssignModalProps) {
  const [assigneeId, setAssigneeId] = useState(alert.assignee?.id ?? '');
  const options = useQuery({ queryKey: ['alerts', 'assignees'], queryFn: () => alertsService.assignees(), staleTime: 60_000 });
  const save = useMutation({
    mutationFn: () => alertsService.assign(alert.id, assigneeId || null),
    onSuccess: (result) => {
      toast.success(result.message);
      onDone();
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const unchanged = assigneeId === (alert.assignee?.id ?? '');

  return (
    <Modal
      open
      title="Mas’ul xodim"
      description={alert.title}
      onClose={onClose}
      closeDisabled={save.isPending}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={unchanged || options.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      {options.isError ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : (
        <FormField label="Mas’ul" htmlFor="alert-assignee" hint="Mas’ul xodim xabar oladi; 48 soatda hal qilinmasa rahbarga ko‘tariladi">
          <Select id="alert-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={options.isPending}>
            <option value="">Mas’ul yo‘q</option>
            {(options.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
                {user.role ? ` · ${user.role}` : ''}
              </option>
            ))}
          </Select>
        </FormField>
      )}
    </Modal>
  );
}
