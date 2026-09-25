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
import { studentsService } from '@/services/students.service';
import type { BulkPortalAccountsResult } from '@/types/portal';
import { downloadCredentialsCsv, printCredentials } from './portalCredentials';

interface BulkPortalAccountsModalProps {
  groups: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Ko‘p o‘quvchiga birdan kabinet ochish. Faqat faol va kabineti yo‘q o‘quvchilar.
 * Login va parollar **faqat shu oynada** — yopishdan oldin chop eting yoki CSV yuklab oling.
 */
export function BulkPortalAccountsModal({ groups, onClose, onSaved }: BulkPortalAccountsModalProps) {
  const [groupId, setGroupId] = useState('');
  const [result, setResult] = useState<BulkPortalAccountsResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => studentsService.bulkCreatePortalAccounts(groupId ? { groupId } : {}),
    onSuccess: (response) => {
      setResult(response.data);
      toast.success(response.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const siteUrl = window.location.origin;
  const rows = result?.created ?? [];

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
      title="O‘quvchilarga kabinet ochish"
      description="Har bir o‘quvchi o‘z ID raqami (ST-000045) va shaxsiy paroli bilan kiradi"
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
          <FormField label="Kimlarga" htmlFor="bulk-group" hint="Faqat faol va hali kabineti yo‘q o‘quvchilarga ochiladi">
            <Select id="bulk-group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              <option value="">Barcha faol o‘quvchilar</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </FormField>
          <Alert tone="info">Keyingi oynada login va parollar ro‘yxati chiqadi — uni chop eting yoki CSV sifatida saqlang.</Alert>
        </div>
      ) : rows.length === 0 ? (
        <Alert tone="info">
          Yangi kabinet ochilmadi — tanlangan o‘quvchilarning hammasida kabinet bor ({result.skipped} ta).
        </Alert>
      ) : (
        <div className="space-y-3">
          <Alert tone="warning">
            {rows.length} ta kabinet ochildi{result.skipped > 0 ? `, ${result.skipped} tasida avvaldan bor edi` : ''}. Parollar faqat hozir ko‘rinadi.
          </Alert>
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
                  <TH>O‘quvchi</TH>
                  <TH>Guruh</TH>
                  <TH>Login</TH>
                  <TH>Parol</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.studentId}>
                    <TD className="text-fg">{row.fullName}</TD>
                    <TD className="text-fg-muted">{row.groupName ?? '—'}</TD>
                    <TD className="font-mono text-fg">{row.login}</TD>
                    <TD className="font-mono font-semibold text-fg">{row.temporaryPassword}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </div>
      )}
    </Modal>
  );
}
