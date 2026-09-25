import { useMutation } from '@tanstack/react-query';
import { Download, KeyRound, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { getErrorMessage } from '@/lib/api';
import { downloadCredentialsCsv, printCredentials } from '@/lib/portalCredentials';
import type { CredentialRow } from '@/lib/portalCredentials';

export interface BulkAccountsOutcome {
  rows: Array<CredentialRow & { id: string }>;
  skipped: number;
  /** Ochilmaganlar izohi (masalan, takror telefon) */
  warnings: string[];
  message: string;
}

interface BulkPortalAccountsModalProps {
  title: string;
  description: string;
  /** "Kimlarga" ro‘yxatidagi birinchi band */
  allLabel: string;
  groups: ReadonlyArray<{ id: string; name: string }>;
  run: (groupId?: string) => Promise<BulkAccountsOutcome>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Ko‘p kishiga birdan kabinet ochish (o‘quvchilar yoki ota-onalar).
 * Login va parollar **faqat shu oynada** — yopishdan oldin chop eting yoki CSV yuklab oling.
 */
export function BulkPortalAccountsModal({ title, description, allLabel, groups, run, onClose, onSaved }: BulkPortalAccountsModalProps) {
  const [groupId, setGroupId] = useState('');
  const [result, setResult] = useState<BulkAccountsOutcome | null>(null);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => run(groupId || undefined),
    onSuccess: (outcome) => {
      setResult(outcome);
      toast.success(outcome.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const siteUrl = window.location.origin;
  const rows = result?.rows ?? [];

  const close = () => {
    // Parollar yo‘qolmasin — saqlanmagan bo‘lsa ogohlantiramiz
    if (rows.length > 0 && !saved && !window.confirm('Parollar chop etilmadi va yuklab olinmadi. Oynani yopsangiz, ularni qayta ko‘rib bo‘lmaydi. Yopilsinmi?')) {
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      size="lg"
      title={title}
      description={description}
      onClose={close}
      closeDisabled={create.isPending}
      footer={
        result ? (
          <Button onClick={close}>Yopish</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Bekor qilish
            </Button>
            <Button leftIcon={<KeyRound className="size-4" aria-hidden />} onClick={() => create.mutate()} loading={create.isPending}>
              Kabinetlarni ochish
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

      {!result ? (
        <div className="space-y-4">
          <FormField label="Kimlarga" htmlFor="bulk-group" hint="Faqat faol va hali kabineti yo‘qlarga ochiladi">
            <Select id="bulk-group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              <option value="">{allLabel}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </FormField>
          <Alert tone="info">Keyingi oynada login va parollar ro‘yxati chiqadi — uni chop eting yoki CSV sifatida saqlang.</Alert>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <Alert tone="info">Yangi kabinet ochilmadi{result.skipped > 0 ? ` — ${result.skipped} tasida avvaldan bor` : ''}.</Alert>
          ) : (
            <Alert tone="warning">
              {rows.length} ta kabinet ochildi{result.skipped > 0 ? `, ${result.skipped} tasida avvaldan bor edi` : ''}. Parollar faqat hozir ko‘rinadi.
            </Alert>
          )}
          {result.warnings.length > 0 && (
            <Alert tone="warning" title="Ochilmadi — email bilan alohida oching">
              {result.warnings.join('; ')}
            </Alert>
          )}
          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  leftIcon={<Printer className="size-4" aria-hidden />}
                  onClick={() => {
                    if (printCredentials(rows, siteUrl)) setSaved(true);
                    else toast.error('Brauzer yangi oynani blokladi — ruxsat bering');
                  }}
                >
                  Kartochkalarni chop etish
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<Download className="size-4" aria-hidden />}
                  onClick={() => {
                    downloadCredentialsCsv(rows);
                    setSaved(true);
                  }}
                >
                  CSV yuklab olish
                </Button>
              </div>
              <TableContainer className="max-h-80 rounded-lg border border-border">
                <Table>
                  <THead>
                    <tr>
                      <TH>Ism</TH>
                      <TH>Izoh</TH>
                      <TH>Login</TH>
                      <TH>Parol</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id}>
                        <TD className="text-fg">{row.fullName}</TD>
                        <TD className="text-fg-muted">{row.subtitle ?? '—'}</TD>
                        <TD className="font-mono text-fg">{row.login}</TD>
                        <TD className="font-mono font-semibold text-fg">{row.temporaryPassword}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
