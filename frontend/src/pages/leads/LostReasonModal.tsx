import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/cn';
import { LOST_REASONS } from '@/utils/leadLabels';

interface LostReasonModalProps {
  leadName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function LostReasonModal({ leadName, loading = false, onClose, onConfirm }: LostReasonModalProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <Modal
      open
      size="sm"
      title="Lead yo‘qotildi"
      description={`${leadName} nima sababdan yo‘qotildi? Sabab hisobotlarda ko‘rinadi.`}
      onClose={onClose}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button variant="danger" loading={loading} disabled={!trimmed} onClick={() => onConfirm(trimmed)}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {LOST_REASONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setReason(item)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              reason === item
                ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
                : 'border-border text-fg-muted hover:bg-surface-muted hover:text-fg',
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <FormField label="Sabab" htmlFor="lost-reason" required>
        <Textarea
          id="lost-reason"
          value={reason}
          maxLength={255}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Yoki o‘zingiz yozing"
          className="min-h-20"
        />
      </FormField>
    </Modal>
  );
}
