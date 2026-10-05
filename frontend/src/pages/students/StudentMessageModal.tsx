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
import { getErrorMessage } from '@/lib/api';
import { studentsService } from '@/services/students.service';
import type { StudentMessageAudience } from '@/types/student';

const AUDIENCES: ReadonlyArray<{ value: StudentMessageAudience; label: string }> = [
  { value: 'STUDENT', label: 'O‘quvchining o‘ziga' },
  { value: 'PARENT', label: 'Ota-onasiga' },
  { value: 'BOTH', label: 'O‘quvchi va ota-onasiga' },
];

/**
 * Bitta o'quvchiga yoki ota-onasiga xabar. Kabinet hisobi bo'lsa — ilova ichida, Telegram bog'langan bo'lsa — botda.
 * Hech bir kanal bo'lmasa server rad etadi va sababi shu oynada ko'rinadi.
 */
export function StudentMessageModal({ student, onClose }: { student: { id: string; name: string }; onClose: () => void }) {
  const [audience, setAudience] = useState<StudentMessageAudience>('STUDENT');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => studentsService.sendMessage(student.id, { audience, title: title.trim(), message: message.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      onClose();
    },
    onError: (failure) => setError(getErrorMessage(failure)),
  });

  const valid = title.trim().length >= 3 && message.trim().length >= 5;

  return (
    <Modal
      open
      title="Xabar yuborish"
      description={student.name}
      onClose={onClose}
      closeDisabled={send.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={send.isPending}>
            Bekor qilish
          </Button>
          <Button loading={send.isPending} disabled={!valid} onClick={() => send.mutate()}>
            Yuborish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Kimga" htmlFor="message-audience">
          <Select id="message-audience" value={audience} onChange={(event) => setAudience(event.target.value as StudentMessageAudience)}>
            {AUDIENCES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Sarlavha" htmlFor="message-title" required>
          <Input id="message-title" value={title} maxLength={120} autoFocus onChange={(event) => setTitle(event.target.value)} />
        </FormField>
        <FormField label="Xabar matni" htmlFor="message-body" required hint={`${message.trim().length} / 1000`}>
          <Textarea id="message-body" rows={5} value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)} />
        </FormField>
        <p className="text-caption text-fg-muted">Xabar kabinetdagi bildirishnomalarga va bog‘langan Telegram’ga boradi. Yuborish audit jurnaliga yoziladi.</p>
      </div>
    </Modal>
  );
}
