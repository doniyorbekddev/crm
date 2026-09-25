import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { taskService } from '@/services/task.service';
import type { TaskStatus } from '@/types/task';
import { formatDateTime } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const STATUS_LABELS: Record<TaskStatus, string> = { OPEN: 'Ochiq', DONE: 'Bajarildi', CANCELLED: 'Bekor' };

/** Xodim ishlari (TZ §51 "Create Task"): avtomatlashtirish yoki qo'lda yaratilgan ishlar */
export default function TasksPage() {
  const queryClient = useQueryClient();
  const canSeeAll = usePermission(PERMISSIONS.ALERT_MANAGE);
  const [status, setStatus] = useState<TaskStatus | ''>('OPEN');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const params = { ...(status ? { status } : {}), scope };
  const query = useQuery({ queryKey: ['tasks', params], queryFn: () => taskService.list(params) });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: TaskStatus }) => taskService.setStatus(id, next),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader title="Ishlarim" description={query.data ? `${query.data.openCount} ta ochiq ish` : 'Avtomatlashtirish va rahbar bergan ishlar'} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label="Holat" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | '')} wrapperClassName="w-40">
          <option value="OPEN">Ochiq</option>
          <option value="DONE">Bajarilgan</option>
          <option value="CANCELLED">Bekor qilingan</option>
          <option value="">Hammasi</option>
        </Select>
        {canSeeAll && (
          <Select aria-label="Kimniki" value={scope} onChange={(event) => setScope(event.target.value as 'mine' | 'all')} wrapperClassName="w-44">
            <option value="mine">Mening ishlarim</option>
            <option value="all">Barcha xodimlar</option>
          </Select>
        )}
      </div>
      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-32" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Ish yo‘q" description="Avtomatlashtirish qoidalari yaratgan ishlar shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.items.map((task) => (
              <li key={task.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {task.link ? (
                      <Link to={task.link} className="hover:underline">
                        {task.title}
                      </Link>
                    ) : (
                      task.title
                    )}
                    <Badge tone={task.status === 'OPEN' ? (task.overdue ? 'red' : 'blue') : task.status === 'DONE' ? 'green' : 'gray'}>{task.overdue ? 'Muddati o‘tgan' : STATUS_LABELS[task.status]}</Badge>
                  </p>
                  {task.description && <p className="mt-1 text-sm text-fg-muted">{task.description}</p>}
                  <p className="mt-1 text-xs text-fg-subtle">
                    {task.dueAt ? `Muddat: ${formatDateTime(task.dueAt)}` : 'Muddatsiz'}
                    {task.rule ? ` · qoida: ${task.rule.name}` : ''}
                    {scope === 'all' ? ` · ${task.assignee.firstName} ${task.assignee.lastName}` : ''}
                  </p>
                </div>
                {task.status === 'OPEN' && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" leftIcon={<Check className="size-4" aria-hidden />} onClick={() => update.mutate({ id: task.id, next: 'DONE' })}>
                      Bajarildi
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`${task.title} — bekor qilish`} onClick={() => update.mutate({ id: task.id, next: 'CANCELLED' })}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
