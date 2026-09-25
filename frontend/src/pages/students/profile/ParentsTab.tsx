import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Pencil, Plus, Star, Unlink, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { parentsService } from '@/services/parents.service';
import type { ParentRelation, StudentParent } from '@/types/parent';
import { formatPhone } from '@/utils/format';
import { PARENT_RELATION_LABELS, PARENT_RELATION_ORDER } from '@/utils/parentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { LinkParentModal } from '../../parents/LinkModals';
import { ParentFormModal } from '../../parents/ParentFormModal';

type Dialog = { type: 'create' } | { type: 'link' } | { type: 'edit'; row: StudentParent } | { type: 'unlink'; row: StudentParent } | null;

export function ParentsTab({ student }: { student: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.PARENT_MANAGE);
  const [dialog, setDialog] = useState<Dialog>(null);

  const query = useQuery({ queryKey: queryKeys.students.parents(student.id), queryFn: () => parentsService.forStudent(student.id) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.parents.all });
  };
  const close = () => setDialog(null);
  const saved = () => {
    setDialog(null);
    refresh();
  };

  const updateLink = useMutation({
    mutationFn: (input: { linkId: string; relation?: ParentRelation; isPrimary?: boolean }) =>
      parentsService.updateLink(input.linkId, { relation: input.relation, isPrimary: input.isPrimary }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.students.parents(student.id), result.data);
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const unlink = useMutation({
    mutationFn: (row: StudentParent) => parentsService.unlink(row.linkId),
    onSuccess: (result) => {
      toast.success(result.message);
      saved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rows = query.data ?? [];

  return (
    <Card>
      {canManage && (
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <Button size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
            Yangi ota-ona
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Link2 className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'link' })}>
            Mavjudini biriktirish
          </Button>
        </div>
      )}

      {query.isPending ? (
        <TableSkeleton rows={2} columns={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UsersRound} title="Ota-ona biriktirilmagan" description="To‘lov eslatmalari va aloqa uchun vakil qo‘shing" />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Ota-ona</TH>
                <TH>Qarindoshlik</TH>
                <TH>Aloqa</TH>
                {canManage && (
                  <TH className="w-12">
                    <span className="sr-only">Amallar</span>
                  </TH>
                )}
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.linkId}>
                  <TD>
                    <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                      {row.firstName} {row.lastName}
                      {row.isPrimary && <Badge tone="blue">Asosiy vakil</Badge>}
                    </p>
                  </TD>
                  <TD>
                    {canManage ? (
                      <Select
                        aria-label={`${row.firstName} ${row.lastName} qarindoshligi`}
                        value={row.relation}
                        disabled={updateLink.isPending}
                        onChange={(event) => updateLink.mutate({ linkId: row.linkId, relation: event.target.value as ParentRelation })}
                        wrapperClassName="w-32"
                      >
                        {PARENT_RELATION_ORDER.map((value) => (
                          <option key={value} value={value}>
                            {PARENT_RELATION_LABELS[value]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      PARENT_RELATION_LABELS[row.relation]
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <a href={`tel:${row.phone}`} className="text-fg hover:text-brand-600">
                      {formatPhone(row.phone)}
                    </a>
                    <p className="text-xs text-fg-muted">{[row.telegram, row.email].filter(Boolean).join(' · ') || '—'}</p>
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      <ActionMenu
                        label={`${row.firstName} ${row.lastName} amallari`}
                        items={[
                          ...(row.isPrimary
                            ? []
                            : [{ label: 'Asosiy vakil qilish', icon: Star, onSelect: () => updateLink.mutate({ linkId: row.linkId, isPrimary: true }) }]),
                          { label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', row }) },
                          { label: 'Ajratish', icon: Unlink, tone: 'danger' as const, onSelect: () => setDialog({ type: 'unlink', row }) },
                        ]}
                      />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      {dialog?.type === 'create' && <ParentFormModal student={student} onClose={close} onSaved={saved} />}
      {dialog?.type === 'link' && (
        <LinkParentModal student={student} linkedParentIds={rows.map((row) => row.parentId)} onClose={close} onSaved={saved} />
      )}
      {dialog?.type === 'edit' && (
        <ParentFormModal
          parent={{ ...dialog.row, id: dialog.row.parentId, createdAt: '', hasPortalAccount: false, students: [] }}
          onClose={close}
          onSaved={saved}
        />
      )}

      <ConfirmDialog
        open={dialog?.type === 'unlink'}
        title="Ota-onani ajratish"
        description={
          dialog?.type === 'unlink'
            ? `${dialog.row.firstName} ${dialog.row.lastName} bu o‘quvchidan ajratiladi, profili saqlanadi.${dialog.row.isPrimary ? ' Asosiy vakil keyingi ota-onaga o‘tadi.' : ''}`
            : ''
        }
        confirmLabel="Ajratish"
        loading={unlink.isPending}
        onConfirm={() => dialog?.type === 'unlink' && unlink.mutate(dialog.row)}
        onCancel={close}
      />
    </Card>
  );
}
