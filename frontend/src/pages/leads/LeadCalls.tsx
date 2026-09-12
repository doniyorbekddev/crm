import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, PhoneCall, PhoneIncoming, Plus, Trash2 } from 'lucide-react';
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
import { queryKeys } from '@/lib/queryKeys';
import { callsService } from '@/services/calls.service';
import type { CallItem, CallListParams } from '@/types/call';
import { CALL_DIRECTION_LABELS, CALL_RESULT_LABELS, CALL_RESULT_TONES, CALL_STATUS_LABELS, formatCallDuration } from '@/utils/callLabels';
import { formatDateTime } from '@/utils/format';
import { CallFormModal } from './CallFormModal';

interface LeadCallsProps {
  leadId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function LeadCalls({ leadId, canCreate, canUpdate, canDelete }: LeadCallsProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ type: 'create' } | { type: 'edit' | 'delete'; call: CallItem } | null>(null);

  const params: CallListParams = { leadId, page: 1, limit: 50 };
  const callsQuery = useQuery({ queryKey: queryKeys.calls.list(params), queryFn: () => callsService.list(params) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.calls.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => callsService.remove(id),
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
            Qo‘ng‘iroq yozish
          </Button>
        </div>
      )}

      {callsQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ) : callsQuery.isError ? (
        <ErrorState error={callsQuery.error} onRetry={() => void callsQuery.refetch()} />
      ) : callsQuery.data.items.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="Qo‘ng‘iroqlar yo‘q"
          description={canCreate ? 'Birinchi qo‘ng‘iroqni yozib qo‘ying' : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {callsQuery.data.items.map((call) => {
            const Icon = call.direction === 'INCOMING' ? PhoneIncoming : PhoneCall;
            return (
              <li key={call.id} className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface text-fg-muted">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {call.result ? (
                          <Badge tone={CALL_RESULT_TONES[call.result]}>{CALL_RESULT_LABELS[call.result]}</Badge>
                        ) : (
                          <Badge>{CALL_STATUS_LABELS[call.status]}</Badge>
                        )}
                        <span className="text-xs text-fg-muted">
                          {CALL_DIRECTION_LABELS[call.direction]} · {formatCallDuration(call.durationSec)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fg-muted">
                        {formatDateTime(call.calledAt)}
                        {call.manager && ` · ${call.manager.firstName} ${call.manager.lastName}`}
                      </p>
                      {call.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{call.notes}</p>}
                      {call.nextCallAt && (
                        <p className="mt-2 text-xs text-fg-muted">Keyingi qo‘ng‘iroq: {formatDateTime(call.nextCallAt)}</p>
                      )}
                    </div>
                  </div>
                  <ActionMenu
                    label="Qo‘ng‘iroq amallari"
                    items={[
                      ...(canUpdate ? [{ label: 'Tahrirlash', icon: Pencil, onSelect: () => setDialog({ type: 'edit', call }) }] : []),
                      ...(canDelete
                        ? [{ label: 'O‘chirish', icon: Trash2, tone: 'danger' as const, onSelect: () => setDialog({ type: 'delete', call }) }]
                        : []),
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.type === 'create' && (
        <CallFormModal
          leadId={leadId}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <CallFormModal
          leadId={leadId}
          call={dialog.call}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Qo‘ng‘iroq o‘chirilsinmi?"
        description="Yozuv butunlay o‘chiriladi."
        confirmLabel="O‘chirish"
        loading={remove.isPending}
        onConfirm={() => dialog?.type === 'delete' && remove.mutate(dialog.call.id)}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
