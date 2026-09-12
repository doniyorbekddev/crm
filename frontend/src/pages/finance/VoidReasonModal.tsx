import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';

interface VoidReasonModalProps {
  title: string;
  description: string;
  /** Bekor qilish sababi majburiy — moliyaviy yozuv izsiz o‘chmaydi */
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
  error?: string | null;
}

export function VoidReasonModal({ title, description, onConfirm, onClose, loading, error }: VoidReasonModalProps) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < 5;

  return (
    <Modal
      open
      title={title}
      description={description}
      onClose={onClose}
      closeDisabled={loading}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button variant="danger" loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>
            Tasdiqlash
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <FormField
        label="Sabab"
        htmlFor="void-reason"
        hint="Kamida 5 belgi — yozuv o‘chmaydi, tarixda sabab bilan saqlanadi"
        required
      >
        <Textarea
          id="void-reason"
          rows={3}
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Masalan: ikki marta kiritilgan"
        />
      </FormField>
    </Modal>
  );
}
