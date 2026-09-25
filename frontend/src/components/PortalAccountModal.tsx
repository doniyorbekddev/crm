import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Printer } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/api';
import { printCredentials } from '@/lib/portalCredentials';
import type { MessageResult } from '@/services/auth.service';
import type { PortalAccount } from '@/types/portal';

interface PortalAccountModalProps {
  /** Kabinet egasi: ism va ikkinchi qator (ID/guruh yoki farzandlar) */
  fullName: string;
  subtitle: string | null;
  /** Emailsiz nima bilan kiradi — tushuntirish matni */
  loginHint: ReactNode;
  /** `create` — yangi kabinet, `reset` — mavjud kabinetga yangi parol */
  mode: 'create' | 'reset';
  create: (email?: string) => Promise<MessageResult<PortalAccount>>;
  reset: () => Promise<MessageResult<PortalAccount>>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Kabinet ochish yoki parolni tiklash (o‘quvchi va ota-ona uchun bitta oyna).
 *
 * Email shart emas: o‘quvchi ID raqami, ota-ona telefon raqami bilan kiradi. Parolni tizim
 * yaratadi, u faqat shu oynada bir marta ko‘rinadi va **vaqtinchalik** — birinchi kirishda
 * egasi o‘z parolini o‘rnatadi.
 */
export function PortalAccountModal({ fullName, subtitle, loginHint, mode, create, reset, onClose, onSaved }: PortalAccountModalProps) {
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => (mode === 'reset' ? reset() : create(email.trim() || undefined)),
    onSuccess: (result) => {
      setAccount(result.data);
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const siteUrl = window.location.origin;

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
    if (!printCredentials([{ fullName, subtitle, login: account.login, temporaryPassword: account.temporaryPassword }], siteUrl)) {
      toast.error('Brauzer yangi oynani blokladi — ruxsat bering');
    }
  }

  return (
    <Modal
      open
      title={mode === 'reset' ? 'Kabinet parolini tiklash' : 'Kabinet ochish'}
      description={subtitle ? `${fullName} · ${subtitle}` : fullName}
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
          <Alert tone="warning">Parol faqat hozir ko‘rinadi va vaqtinchalik — birinchi kirishda egasi o‘z parolini o‘rnatadi.</Alert>
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
        <p className="text-sm text-fg-muted">Yangi vaqtinchalik parol yaratiladi. Eski parol va barcha ochiq sessiyalar bekor bo‘ladi.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">{loginHint}</p>
          <FormField label="Email (ixtiyoriy)" htmlFor="portal-email" hint="Kiritilsa, parolni email orqali o‘zi tiklay oladi">
            <Input
              id="portal-email"
              type="email"
              autoComplete="off"
              value={email}
              placeholder="misol@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
