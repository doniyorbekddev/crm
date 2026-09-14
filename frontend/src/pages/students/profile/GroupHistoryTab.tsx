import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Layers, UserMinus, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import type { GroupChangeKind, StudentGroupChange, StudentItem } from '@/types/student';
import { formatDateTime } from '@/utils/format';
import { TransferGroupModal } from '../TransferGroupModal';

const KIND_ICONS: Record<GroupChangeKind, LucideIcon> = {
  ENROLLED: UserPlus,
  TRANSFERRED: ArrowLeftRight,
  REMOVED: UserMinus,
};

function changeTitle(change: StudentGroupChange): string {
  if (change.kind === 'ENROLLED') return `Guruhga qo‘shildi: ${change.to?.name ?? '—'}`;
  if (change.kind === 'REMOVED') return `Guruhdan chiqarildi: ${change.from?.name ?? '—'}`;
  return `${change.from?.name ?? '—'} → ${change.to?.name ?? '—'}`;
}

export function GroupHistoryTab({ student, canManage }: { student: StudentItem; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.students.groupHistory(student.id),
    queryFn: () => studentsService.groupHistory(student.id),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <p className="text-sm text-fg-muted">
          Hozirgi guruh: <span className="font-medium text-fg">{student.group?.name ?? 'guruhsiz'}</span>
        </p>
        {canManage && (
          <Button size="sm" variant="secondary" leftIcon={<ArrowLeftRight className="size-4" aria-hidden />} onClick={() => setTransferOpen(true)}>
            Guruhga o‘tkazish
          </Button>
        )}
      </div>

      {query.isPending ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={Layers} title="Guruh tarixi yo‘q" description="O‘quvchi guruhga qo‘shilganda yoki o‘tkazilganda shu yerda ko‘rinadi" />
      ) : (
        <ol className="relative space-y-4 p-4 before:absolute before:top-6 before:bottom-6 before:left-[29px] before:w-px before:bg-border">
          {query.data.map((change) => {
            const Icon = KIND_ICONS[change.kind];
            return (
              <li key={change.id} className="relative flex gap-3">
                <span
                  className={cn(
                    'z-10 grid size-7 shrink-0 place-items-center rounded-full border',
                    change.kind === 'REMOVED'
                      ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400'
                      : change.kind === 'ENROLLED'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium break-words text-fg">{changeTitle(change)}</p>
                    <span className="text-xs text-fg-subtle">{formatDateTime(change.changedAt)}</span>
                  </div>
                  {change.reason && <p className="text-sm break-words text-fg-muted">{change.reason}</p>}
                  <p className="text-xs text-fg-subtle">
                    {change.changedBy ? `${change.changedBy.firstName} ${change.changedBy.lastName}` : 'Tizim'}
                    {change.daysInPreviousGroup !== null && ` · oldingi guruhda ${change.daysInPreviousGroup} kun`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {transferOpen && (
        <TransferGroupModal
          student={student}
          onClose={() => setTransferOpen(false)}
          onSaved={() => {
            setTransferOpen(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
          }}
        />
      )}
    </Card>
  );
}
