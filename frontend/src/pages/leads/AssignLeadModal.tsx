import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import type { LeadDetail, LeadFormLookups } from '@/types/lead';
import { leadFullName } from '@/utils/leadLabels';

interface AssignLeadModalProps {
  lead: LeadDetail;
  managers: LeadFormLookups['managers'];
  canViewAll: boolean;
  currentUserId: string;
  loading: boolean;
  onClose: () => void;
  onAssign: (assignedToId: string | null) => void;
}

/** `lead.view_all` bo‘lmasa, xodim leadni faqat o‘ziga oladi yoki o‘zidan bo‘shatadi. */
export function AssignLeadModal({ lead, managers, canViewAll, currentUserId, loading, onClose, onAssign }: AssignLeadModalProps) {
  const [assigneeId, setAssigneeId] = useState(lead.assignedTo?.id ?? '');
  const options = canViewAll ? managers : managers.filter((manager) => manager.id === currentUserId);
  const canUnassign = canViewAll || lead.assignedTo?.id === currentUserId || !lead.assignedTo;
  const unchanged = assigneeId === (lead.assignedTo?.id ?? '');

  return (
    <Modal
      open
      size="sm"
      title="Mas’ul xodim"
      description={`${leadFullName(lead)} (${lead.code}) bilan kim ishlaydi?`}
      onClose={onClose}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button loading={loading} disabled={unchanged} onClick={() => onAssign(assigneeId || null)}>
            Saqlash
          </Button>
        </>
      }
    >
      <FormField label="Xodim" htmlFor="lead-assignee" hint={canViewAll ? undefined : 'Siz leadni faqat o‘zingizga biriktira olasiz'}>
        <Select id="lead-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          {canUnassign && <option value="">Biriktirilmagan</option>}
          {options.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.firstName} {manager.lastName} — {manager.roleName}
            </option>
          ))}
        </Select>
      </FormField>
    </Modal>
  );
}
