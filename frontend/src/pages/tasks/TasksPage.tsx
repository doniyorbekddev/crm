import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, MessageSquare, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { taskService } from '@/services/task.service';
import type { TaskPriority, TaskStatus } from '@/types/task';
import { formatDateTime } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { TaskFormModal } from './TaskFormModal';
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_TONES, TASK_STATUS_LABELS as STATUS_LABELS } from './taskLabels';
import { useInitialParam } from '@/hooks/useInitialParam';

const PAGE_SIZE = 20;
type Scope = 'mine' | 'created' | 'all';

/** Xodim vazifalari (CRM 4.0 "Vazifa 2.0"): qo'lda, avtomatlashtirish yoki ogohlantirishdan yaratilgan ishlar */
export default function TasksPage() {
  const queryClient = useQueryClient();
  const canSeeAll = usePermission(PERMISSIONS.TASK_VIEW_ALL);
  const canCreate = usePermission(PERMISSIONS.TASK_CREATE);
  const canAssign = usePermission(PERMISSIONS.TASK_ASSIGN);
  const [status, setStatus] = useState<TaskStatus | ''>('OPEN');
  // Havola orqali kelganda: /tasks?scope=all&overdue=1 (ruxsat bo'lmasa server baribir o'zinikini qaytaradi)
  const [scope, setScope] = useState<Scope>(useInitialParam<Scope>('scope', ['mine', 'created', 'all'], 'mine'));
  const [overdueOnly, setOverdueOnly] = useState(useInitialParam<'1' | ''>('overdue', ['1'], '') === '1');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const params = { ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(overdueOnly ? { overdue: true } : {}), scope, page, limit: PAGE_SIZE };
  const query = useQuery({ queryKey: ['tasks', params], queryFn: () => taskService.list(params) });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: TaskStatus }) => taskService.setStatus(id, next),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Vazifalar"
        description={query.data ? `${query.data.openCount} ta ochiq ish` : 'Avtomatlashtirish va rahbar bergan ishlar'}
        actions={
          canCreate ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              Yangi vazifa
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label="Holat" value={status} onChange={(event) => { setStatus(event.target.value as TaskStatus | ''); setPage(1); }} wrapperClassName="w-40">
          <option value="OPEN">Ochiq</option>
          <option value="DONE">Bajarilgan</option>
          <option value="CANCELLED">Bekor qilingan</option>
          <option value="">Hammasi</option>
        </Select>
        <Select aria-label="Ustuvorlik" value={priority} onChange={(event) => { setPriority(event.target.value as TaskPriority | ''); setPage(1); }} wrapperClassName="w-40">
          <option value="">Har qanday ustuvorlik</option>
          {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((key) => (
            <option key={key} value={key}>
              {TASK_PRIORITY_LABELS[key]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-body text-fg">
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={overdueOnly}
            onChange={(event) => {
              setOverdueOnly(event.target.checked);
              setPage(1);
            }}
          />
          Faqat kechikkanlar
        </label>
        {(canSeeAll || canAssign) && (
          <Select aria-label="Kimniki" value={scope} onChange={(event) => { setScope(event.target.value as Scope); setPage(1); }} wrapperClassName="w-44">
            <option value="mine">Mening ishlarim</option>
            <option value="created">Men berganlar</option>
            {canSeeAll && <option value="all">Barcha xodimlar</option>}
          </Select>
        )}
      </div>
      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-32" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Ish yo‘q" description="Sizga berilgan va avtomatlashtirish yaratgan vazifalar shu yerda ko‘rinadi" />
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
                    {(task.priority === 'HIGH' || task.priority === 'URGENT') && <Badge tone={TASK_PRIORITY_TONES[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>}
                  </p>
                  {task.description && <p className="mt-1 text-body text-fg-muted">{task.description}</p>}
                  <p className="mt-1 text-caption text-fg-subtle">
                    {task.dueAt ? `Muddat: ${formatDateTime(task.dueAt)}` : 'Muddatsiz'}
                    {task.rule ? ` · qoida: ${task.rule.name}` : ''}
                    {scope !== 'mine' ? ` · ${task.assignee.firstName} ${task.assignee.lastName}` : ''}
                    {scope === 'mine' && task.createdBy && task.createdBy.id !== task.assignee.id ? ` · berdi: ${task.createdBy.firstName} ${task.createdBy.lastName}` : ''}
                  </p>
                  <button type="button" className="mt-1 inline-flex items-center gap-1 text-caption text-primary hover:underline" onClick={() => setOpenId(task.id)}>
                    <MessageSquare className="size-3.5" aria-hidden />
                    Tafsilot{task.commentCount ? ` · ${task.commentCount} izoh` : ''}
                  </button>
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
      {query.data && query.data.total > PAGE_SIZE && (
        <div className="mt-4">
          <Pagination page={page} totalPages={Math.ceil(query.data.total / PAGE_SIZE)} total={query.data.total} limit={PAGE_SIZE} onPageChange={setPage} disabled={query.isFetching} />
        </div>
      )}
      {creating && <TaskFormModal open onClose={() => setCreating(false)} canAssign={canAssign} />}
      <TaskDetailDrawer taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
