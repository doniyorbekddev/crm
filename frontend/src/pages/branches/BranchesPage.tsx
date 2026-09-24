import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { branchesService } from '@/services/branches.service';
import type { Branch } from '@/types/branch';
import { formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

interface Draft {
  id?: string;
  key: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY: Draft = { key: '', name: '', address: '', phone: '', isActive: true, sortOrder: '0' };

/**
 * Filiallar. Bitta filial bilan ishlayotgan markazda bu sahifa kerak bo'lmaydi —
 * yangi filial ochilganda xodimlar, o'quvchilar va moliya avtomatik ajraladi.
 */
export default function BranchesPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.BRANCH_MANAGE);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({ queryKey: queryKeys.branches.list, queryFn: branchesService.list });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        key: draft!.key.trim().toUpperCase(),
        name: draft!.name.trim(),
        isActive: draft!.isActive,
        sortOrder: Number(draft!.sortOrder || 0),
        ...(draft!.address.trim() ? { address: draft!.address.trim() } : {}),
        ...(draft!.phone.trim() ? { phone: draft!.phone.trim() } : {}),
      };
      return draft!.id ? branchesService.update(draft!.id, payload) : branchesService.create(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setDraft(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  function edit(branch: Branch) {
    setFormError(null);
    setDraft({
      id: branch.id,
      key: branch.key,
      name: branch.name,
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      isActive: branch.isActive,
      sortOrder: String(branch.sortOrder),
    });
  }

  return (
    <>
      <PageHeader
        title="Filiallar"
        description="Har bir filialning o‘quvchilari, xodimlari va moliyasi alohida hisoblanadi"
        actions={
          canManage && (
            <Button
              leftIcon={<Plus className="size-4" aria-hidden />}
              onClick={() => {
                setFormError(null);
                setDraft(EMPTY);
              }}
            >
              Filial qo‘shish
            </Button>
          )
        }
      />

      <Card>
        {query.isPending ? (
          <TableSkeleton rows={3} columns={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={Building2} title="Filial yo‘q" description="Birinchi filialni qo‘shing" />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Filial</TH>
                  <TH>Manzil</TH>
                  <TH className="text-right">Xodimlar</TH>
                  <TH className="text-right">O‘quvchilar</TH>
                  <TH className="text-right">Guruhlar</TH>
                  <TH>Holat</TH>
                  {canManage && <TH className="w-24" />}
                </tr>
              </THead>
              <TBody>
                {query.data.map((branch) => (
                  <TR key={branch.id}>
                    <TD>
                      <p className="font-medium text-fg">{branch.name}</p>
                      <p className="font-mono text-xs text-fg-subtle">{branch.key}</p>
                    </TD>
                    <TD className="text-fg-muted">
                      {branch.address ?? '—'}
                      {branch.phone && <p className="text-xs text-fg-subtle">{branch.phone}</p>}
                    </TD>
                    <TD className="text-right tabular-nums text-fg-muted">{formatNumber(branch.counts.users)}</TD>
                    <TD className="text-right tabular-nums text-fg-muted">{formatNumber(branch.counts.students)}</TD>
                    <TD className="text-right tabular-nums text-fg-muted">{formatNumber(branch.counts.groups)}</TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={branch.isActive ? 'green' : 'gray'}>{branch.isActive ? 'Faol' : 'O‘chirilgan'}</Badge>
                        {branch.isMain && <Badge tone="blue">Asosiy</Badge>}
                      </div>
                    </TD>
                    {canManage && (
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => edit(branch)}>
                          Tahrir
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {draft && (
        <Modal
          open
          title={draft.id ? 'Filialni tahrirlash' : 'Yangi filial'}
          description="Kalit keyin o‘zgartirilmaydi — u hisobotlarda ishlatiladi."
          onClose={() => setDraft(null)}
          closeDisabled={save.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={save.isPending} onClick={() => setDraft(null)}>
                Bekor qilish
              </Button>
              <Button
                disabled={draft.key.trim().length < 2 || draft.name.trim().length < 2}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Saqlash
              </Button>
            </>
          }
        >
          {formError && (
            <Alert tone="error" className="mb-4">
              {formError}
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Kalit</span>
              <Input
                value={draft.key}
                placeholder="CHILONZOR"
                disabled={Boolean(draft.id)}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Nomi</span>
              <Input value={draft.name} placeholder="Chilonzor filiali" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Manzil</span>
              <Input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Telefon</span>
              <Input value={draft.phone} type="tel" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-fg-muted">Tartib</span>
              <Input type="number" min={0} value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-fg">
              <Checkbox checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
              Faol
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
