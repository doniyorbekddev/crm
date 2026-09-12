import { UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import type { Role } from '@/types/role';
import type { UserListItem } from '@/types/user';

interface ApproveUserModalProps {
  user: UserListItem;
  roles: Role[];
  loading: boolean;
  onClose: () => void;
  onApprove: (roleId: string) => void;
}

export function ApproveUserModal({ user, roles, loading, onClose, onApprove }: ApproveUserModalProps) {
  const [roleId, setRoleId] = useState(user.role.id);

  return (
    <Modal
      open
      size="sm"
      title="Xodimni tasdiqlash"
      description={`${user.firstName} ${user.lastName} (${user.email}) tasdiqlangach tizimga kira oladi.`}
      onClose={onClose}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button leftIcon={<UserCheck className="size-4" aria-hidden />} loading={loading} disabled={!roleId} onClick={() => onApprove(roleId)}>
            Tasdiqlash
          </Button>
        </>
      }
    >
      <FormField label="Rol" htmlFor="approve-role" hint="Ro‘yxatdan o‘tganda eng kam huquqli rol beriladi — kerakli rolni tanlang">
        <Select id="approve-role" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </FormField>
    </Modal>
  );
}
