import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GroupMasteryMatrix } from './GroupMasteryMatrix';
import { MasterySettingsModal } from './MasterySettingsModal';

/**
 * Guruh o'zlashtirish matritsasi: o'quvchi × mavzu (TZ §26–27). O'qituvchi qaysi mavzu guruh
 * bo'yicha zaif ekanini va kim ortda qolayotganini bir qarashda ko'radi.
 */
export function GroupMasteryModal({ group, onClose }: { group: { id: string; name: string }; onClose: () => void }) {
  const canConfigure = usePermission(PERMISSIONS.SETTINGS_MANAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Modal
      open
      size="xl"
      title="Mavzular bo‘yicha o‘zlashtirish"
      description={group.name}
      onClose={onClose}
      footer={
        <>
          {canConfigure && (
            <Button variant="secondary" leftIcon={<Settings2 className="size-4" aria-hidden />} onClick={() => setSettingsOpen(true)}>
              Chegaralar
            </Button>
          )}
          <Button onClick={onClose}>Yopish</Button>
        </>
      }
    >
      <GroupMasteryMatrix groupId={group.id} />
      {settingsOpen && <MasterySettingsModal onClose={() => setSettingsOpen(false)} />}
    </Modal>
  );
}
