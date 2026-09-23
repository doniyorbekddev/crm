import { useMutation } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/api';
import { studentsService } from '@/services/students.service';
import type { PortalAccount } from '@/types/portal';
import type { StudentItem } from '@/types/student';

interface PortalAccountModalProps {
  student: StudentItem;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * O'quvchiga kabinet hisobi ochish. Parolni tizim generatsiya qiladi va u faqat shu oynada
 * bir marta ko'rsatiladi — bazada faqat hash saqlanadi, qayta ko'rish imkoni yo'q.
 */
export function PortalAccountModal({ student, onClose, onSaved }: PortalAccountModalProps) {
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => studentsService.createPortalAccount(student.id, email.trim()),
    onSuccess: (result) => {
      setAccount(result.data);
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  async function copyCredentials() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(`${account.email} / ${account.temporaryPassword}`);
      setCopied(true);
    } catch {
      toast.error('Nusxa olinmadi — qo‘lda ko‘chiring');
    }
  }

  return (
    <Modal
      open
      title="Kabinet ochish"
      description={`${student.firstName} ${student.lastName} · ${student.code}`}
      onClose={onClose}
      closeDisabled={create.isPending}
      footer={
        account ? (
          <Button onClick={onClose}>Yopish</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Bekor qilish
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={email.trim().length < 5}>
              Ochish
            </Button>
          </>
        )
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      {account ? (
        <div className="space-y-3">
          <Alert tone="warning">
            Parol faqat hozir ko‘rinadi. Uni o‘quvchiga yetkazing — keyin qayta ko‘rish imkoni bo‘lmaydi.
          </Alert>
          <div className="rounded-lg border border-border bg-surface-muted p-3 font-mono text-sm">
            <p className="text-fg">{account.email}</p>
            <p className="mt-1 text-lg font-semibold text-fg">{account.temporaryPassword}</p>
          </div>
          <Button
            variant="secondary"
            leftIcon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            onClick={() => void copyCredentials()}
          >
            {copied ? 'Nusxa olindi' : 'Nusxa olish'}
          </Button>
        </div>
      ) : (
        <FormField
          label="Email"
          htmlFor="portal-email"
          hint="O‘quvchi shu email va tizim bergan parol bilan kabinetga kiradi"
        >
          <Input
            id="portal-email"
            type="email"
            autoComplete="off"
            value={email}
            placeholder="oquvchi@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
      )}
    </Modal>
  );
}
