import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { followUpsService } from '@/services/followUps.service';
import type { FollowUpItem, FollowUpListParams } from '@/types/followUp';
import { FOLLOW_UP_STATE_LABELS, FOLLOW_UP_STATE_TONES } from '@/utils/callLabels';
import { formatDateTime } from '@/utils/format';
import { CompleteFollowUpModal } from './CompleteFollowUpModal';
import { FollowUpFormModal } from './FollowUpFormModal';

interface LeadFollowUpsProps {
  leadId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

type Dialog = { type: 'create' } | { type: 'edit' | 'complete' | 'delete'; followUp: FollowUpItem } | null;

export function LeadFollowUps({ leadId, canCreate, canUpdate, canDelete }: LeadFollowUpsProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);

  const params: FollowUpListParams = { leadId, page: 1, limit: 50, scope: 'all' };
  const followUpsQuery = useQuery({ queryKey: queryKeys.followUps.list(params), queryFn: () => followUpsService.list(params) });

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

  return (
    <div className="space-y-4 p-5">
      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
            Follow-up qo‘shish
          </Button>
        </div>
      )}

      {followUpsQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : followUpsQuery.isError ? (
        <ErrorState error={followUpsQuery.error} onRetry={() => void followUpsQuery.refetch()} />
      ) : followUpsQuery.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Follow-up yo‘q"
          description={canCreate ? 'Keyingi aloqani rejalashtiring — vaqti kelganda eslatma keladi' : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {followUpsQuery.data.items.map((followUp) => (
            <li
              key={followUp.id}
              className={cn(
                'rounded-lg border p-3',
                followUp.state === 'OVERDUE' ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30' : 'border-border bg-surface-muted/40',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('font-medium text-fg', followUp.status !== 'PENDING' && 'text-fg-muted line-through')}>
                      {followUp.title}
                    </p>
                    <Badge tone={FOLLOW_UP_STATE_TONES[followUp.state]}>{FOLLOW_UP_STATE_LABELS[followUp.state]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {formatDateTime(followUp.dueAt)}
                    {followUp.assignedTo && ` · ${followUp.assignedTo.firstName} ${followUp.assignedTo.lastName}`}
                  </p>
                  {followUp.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{followUp.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
                    label="Follow-up amallari"
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
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.type === 'create' && (
        <FollowUpFormModal
          leadId={leadId}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <FollowUpFormModal
          leadId={leadId}
          followUp={dialog.followUp}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
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
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Follow-up o‘chirilsinmi?"
        description="Vazifa butunlay o‘chiriladi."
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.followUp.id)}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
