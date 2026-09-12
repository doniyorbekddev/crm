import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Check, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { followUpsService } from '@/services/followUps.service';
import { CompleteFollowUpModal } from '@/pages/leads/CompleteFollowUpModal';
import { FollowUpFormModal } from '@/pages/leads/FollowUpFormModal';
import type { FollowUpItem, FollowUpListParams, FollowUpScope } from '@/types/followUp';
import { FOLLOW_UP_SCOPE_LABELS, FOLLOW_UP_STATE_LABELS, FOLLOW_UP_STATE_TONES } from '@/utils/callLabels';
import { formatDateTime, formatPhone } from '@/utils/format';
import { leadFullName } from '@/utils/leadLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

const PAGE_SIZE = 20;

const SCOPES: readonly FollowUpScope[] = ['overdue', 'today', 'tomorrow', 'upcoming', 'all', 'done'];

type Dialog = { type: 'edit' | 'complete' | 'delete'; followUp: FollowUpItem } | null;

export default function FollowUpsPage() {
  const queryClient = useQueryClient();
  const canUpdate = usePermission(PERMISSIONS.FOLLOWUP_UPDATE);
  const canDelete = usePermission(PERMISSIONS.FOLLOWUP_DELETE);
  const canViewAll = usePermission(PERMISSIONS.LEAD_VIEW_ALL);

  const [scope, setScope] = useState<FollowUpScope>('today');
  const [assignedTo, setAssignedTo] = useState(canViewAll ? '' : 'me');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const filters = assignedTo ? { assignedTo } : {};
  const params: FollowUpListParams = { page, limit: PAGE_SIZE, scope, ...filters };

  const listQuery = useQuery({
    queryKey: queryKeys.followUps.list(params),
    queryFn: () => followUpsService.list(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.followUps.summary(filters),
    queryFn: () => followUpsService.summary(filters),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.followUps.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => followUpsService.remove(id),
    onSuccess: (message) => {
      toast.success(message);
      setDialog(null);
      refresh();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDialog(null);
    },
  });

  const summary = summaryQuery.data;
  const counts: Partial<Record<FollowUpScope, number>> = summary
    ? { overdue: summary.overdue, today: summary.today, tomorrow: summary.tomorrow, upcoming: summary.upcoming }
    : {};

  return (
    <>
      <PageHeader
        title="Follow-up"
        description="Bugungi ishlar: kim bilan, qachon bog‘lanish kerak"
        actions={
          canViewAll ? (
            <Select value={assignedTo} onChange={(event) => { setAssignedTo(event.target.value); setPage(1); }} aria-label="Mas’ul" wrapperClassName="w-52">
              <option value="">Barcha xodimlar</option>
              <option value="me">Faqat meniki</option>
            </Select>
          ) : undefined
        }
      />

      <Card>
        <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border p-3">
          {SCOPES.map((item) => {
            const active = scope === item;
            const count = counts[item];
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setScope(item);
                  setPage(1);
                }}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                {FOLLOW_UP_SCOPE_LABELS[item]}
                {count !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      item === 'overdue' && count > 0 && !active && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100',
                      active ? 'bg-brand-100 dark:bg-brand-900' : 'bg-surface-muted',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {listQuery.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={scope === 'overdue' ? 'Kechikkan vazifa yo‘q' : 'Vazifa yo‘q'}
            description="Follow-up lead sahifasidan yaratiladi"
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Muddat</TH>
                    <TH>Vazifa</TH>
                    <TH>Lead</TH>
                    <TH>Mas’ul</TH>
                    <TH>Holat</TH>
                    <TH className="w-32">
                      <span className="sr-only">Amallar</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {listQuery.data.items.map((followUp) => (
                    <TR key={followUp.id}>
                      <TD className={cn('whitespace-nowrap', followUp.state === 'OVERDUE' ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted')}>
                        {formatDateTime(followUp.dueAt)}
                      </TD>
                      <TD>
                        <p className="font-medium text-fg">{followUp.title}</p>
                        {followUp.notes && <p className="mt-0.5 max-w-md truncate text-xs text-fg-muted">{followUp.notes}</p>}
                      </TD>
                      <TD>
                        <Link to={`/leads/${followUp.leadId}`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                          {leadFullName(followUp.lead)}
                        </Link>
                        <p className="text-xs text-fg-muted">
                          {followUp.lead.code} · {formatPhone(followUp.lead.phone)}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {followUp.assignedTo ? `${followUp.assignedTo.firstName} ${followUp.assignedTo.lastName}` : '—'}
                      </TD>
                      <TD>
                        <Badge tone={FOLLOW_UP_STATE_TONES[followUp.state]}>{FOLLOW_UP_STATE_LABELS[followUp.state]}</Badge>
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && followUp.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              leftIcon={<Check className="size-4" aria-hidden />}
                              onClick={() => setDialog({ type: 'complete', followUp })}
                            >
                              Bajarildi
                            </Button>
                          )}
                          <ActionMenu
                            label="Amallar"
                            items={[
                              ...(canUpdate && followUp.status === 'PENDING'
                                ? [{ label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', followUp }) }]
                                : []),
                              ...(canDelete
                                ? [{ label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setDialog({ type: 'delete', followUp }) }]
                                : []),
                            ]}
                          />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={listQuery.data.meta.page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={listQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={listQuery.isFetching}
            />
          </>
        )}
      </Card>

      {dialog?.type === 'complete' && (
        <CompleteFollowUpModal
          followUp={dialog.followUp}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <FollowUpFormModal
          leadId={dialog.followUp.leadId}
          followUp={dialog.followUp}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Follow-up o‘chirilsinmi?"
        description="Vazifa butunlay o‘chiriladi."
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.followUp.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
