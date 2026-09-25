import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Printer } from 'lucide-react';
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
import { printCredentials } from './portalCredentials';

interface PortalAccountModalProps {
  student: StudentItem;
  /** `create` — yangi kabinet, `reset` — mavjud kabinetga yangi parol */
  mode?: 'create' | 'reset';
  onClose: () => void;
  onSaved: () => void;
}

/**
 * O‘quvchi kabineti: ochish yoki parolni tiklash.
 *
 * O‘quvchi **ID raqami** (ST-000045) bilan kiradi — email shart emas. Parolni tizim yaratadi
 * va u faqat shu oynada bir marta ko‘rinadi (bazada faqat hash).
 */
export function PortalAccountModal({ student, mode = 'create', onClose, onSaved }: PortalAccountModalProps) {
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      mode === 'reset' ? studentsService.resetPortalPassword(student.id) : studentsService.createPortalAccount(student.id, email.trim() || undefined),
    onSuccess: (result) => {
      setAccount(result.data);
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const siteUrl = window.location.origin;
  const fullName = `${student.firstName} ${student.lastName}`;

  async function copyCredentials() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(`Sayt: ${siteUrl}\nLogin: ${account.login}\nParol: ${account.temporaryPassword}`);
      setCopied(true);
    } catch {
      toast.error('Nusxa olinmadi — qo‘lda ko‘chiring');
    }
  }

  function print() {
    if (!account) return;
    const opened = printCredentials(
      [{ fullName, code: student.code, groupName: student.group?.name ?? null, login: account.login, temporaryPassword: account.temporaryPassword }],
      siteUrl,
    );
    if (!opened) toast.error('Brauzer yangi oynani blokladi — ruxsat bering');
  }

  return (
    <Modal
      open
      title={mode === 'reset' ? 'Kabinet parolini tiklash' : 'Kabinet ochish'}
      description={`${fullName} · ${student.code}`}
      onClose={onClose}
      closeDisabled={submit.isPending}
      footer={
        account ? (
          <Button onClick={onClose}>Yopish</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
              Bekor qilish
            </Button>
            <Button onClick={() => submit.mutate()} loading={submit.isPending}>
              {mode === 'reset' ? 'Yangi parol yaratish' : 'Kabinet ochish'}
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
          <Alert tone="warning">Parol faqat hozir ko‘rinadi. Uni o‘quvchiga yetkazing — keyin qayta ko‘rish imkoni bo‘lmaydi.</Alert>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-surface-muted p-3 text-sm">
            <dt className="text-fg-muted">Sayt</dt>
            <dd className="truncate text-fg">{siteUrl}</dd>
            <dt className="text-fg-muted">Login</dt>
            <dd className="font-mono text-base font-semibold text-fg">{account.login}</dd>
            <dt className="text-fg-muted">Parol</dt>
            <dd className="font-mono text-lg font-semibold text-fg">{account.temporaryPassword}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              leftIcon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              onClick={() => void copyCredentials()}
            >
              {copied ? 'Nusxa olindi' : 'Nusxa olish'}
            </Button>
            <Button variant="secondary" leftIcon={<Printer className="size-4" aria-hidden />} onClick={print}>
              Chop etish
            </Button>
          </div>
        </div>
      ) : mode === 'reset' ? (
        <p className="text-sm text-fg-muted">
          Yangi vaqtinchalik parol yaratiladi. Eski parol va o‘quvchining barcha ochiq sessiyalari bekor bo‘ladi.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            O‘quvchi <b className="font-mono text-fg">{student.code}</b> ID raqami va tizim bergan parol bilan kiradi.
          </p>
          <FormField label="Email (ixtiyoriy)" htmlFor="portal-email" hint="Kiritilsa, o‘quvchi parolni email orqali o‘zi tiklay oladi">
            <Input
              id="portal-email"
              type="email"
              autoComplete="off"
              value={email}
              placeholder="oquvchi@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
