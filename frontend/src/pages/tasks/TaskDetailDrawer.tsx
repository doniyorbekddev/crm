import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { taskService } from '@/services/task.service';
import { formatDateTime } from '@/utils/format';
import { TaskFormModal } from './TaskFormModal';
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_TONES, TASK_SOURCE_LABELS, TASK_STATUS_LABELS, personName } from './taskLabels';

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

/** Vazifa tafsiloti: izohlar, biriktirish tarixi, qayta biriktirish */
export function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['tasks', 'detail', taskId], queryFn: () => taskService.get(taskId!), enabled: Boolean(taskId) });
  const task = query.data;
  const assignees = useQuery({ queryKey: ['tasks', 'assignees'], queryFn: () => taskService.assignees(), enabled: Boolean(task?.can.assign), staleTime: 60_000 });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['my-work'] });
  };
  const addComment = useMutation({
    mutationFn: (content: string) => taskService.addComment(taskId!, content),
    onSuccess: () => {
      setComment('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const assign = useMutation({
    mutationFn: (userId: string) => taskService.assign(taskId!, { assigneeId: userId }),
    onSuccess: (result) => {
      toast.success(result.message);
      setAssigneeId('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onComment = (event: FormEvent) => {
    event.preventDefault();
    if (comment.trim()) addComment.mutate(comment.trim());
  };

  return (
    <Drawer open={Boolean(taskId)} title={task?.title ?? 'Vazifa'} onClose={onClose}>
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : task ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={task.status === 'OPEN' ? (task.overdue ? 'red' : 'blue') : task.status === 'DONE' ? 'green' : 'gray'}>{task.overdue ? 'Muddati o‘tgan' : TASK_STATUS_LABELS[task.status]}</Badge>
            <Badge tone={TASK_PRIORITY_TONES[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
            <Badge tone="gray">{TASK_SOURCE_LABELS[task.source]}</Badge>
          </div>
          {task.description && <p className="whitespace-pre-line text-body text-fg-muted">{task.description}</p>}
          <dl className="grid grid-cols-2 gap-3 text-body">
            <div>
              <dt className="text-caption text-fg-subtle">Ijrochi</dt>
              <dd className="text-fg">{personName(task.assignee)}</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-subtle">Kim berdi</dt>
              <dd className="text-fg">{task.createdBy ? personName(task.createdBy) : task.rule ? `Qoida: ${task.rule.name}` : 'Tizim'}</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-subtle">Muddat</dt>
              <dd className="text-fg">{task.dueAt ? formatDateTime(task.dueAt) : 'Muddatsiz'}</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-subtle">Yaratilgan</dt>
              <dd className="text-fg">{formatDateTime(task.createdAt)}</dd>
            </div>
          </dl>
          {task.can.edit && task.status === 'OPEN' && (
            <div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Tahrirlash
              </Button>
            </div>
          )}
          {task.link && (
            <Link to={task.link} className="text-body text-primary hover:underline" onClick={onClose}>
              Bog‘liq sahifani ochish
            </Link>
          )}

          {task.can.assign && task.status === 'OPEN' && (
            <section aria-label="Qayta biriktirish" className="flex items-end gap-2">
              <Select aria-label="Yangi ijrochi" wrapperClassName="flex-1" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Boshqa xodimga biriktirish…</option>
                {(assignees.data ?? [])
                  .filter((user) => user.id !== task.assignee.id)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                      {user.role ? ` · ${user.role}` : ''}
                    </option>
                  ))}
              </Select>
              <Button variant="secondary" disabled={!assigneeId} loading={assign.isPending} onClick={() => assign.mutate(assigneeId)}>
                Biriktirish
              </Button>
            </section>
          )}

          {task.assignments.length > 1 && (
            <section>
              <h3 className="mb-2 text-label font-medium text-fg">Biriktirish tarixi</h3>
              <ul className="space-y-1 text-caption text-fg-muted">
                {task.assignments.map((item) => (
                  <li key={item.id}>
                    {formatDateTime(item.createdAt)} · {item.from ? `${personName(item.from)} → ` : ''}
                    {personName(item.to)}
                    {item.changedBy ? ` (${personName(item.changedBy)})` : ''}
                    {item.note ? ` — ${item.note}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-label font-medium text-fg">Izohlar</h3>
            {task.comments.length === 0 ? (
              <p className="text-caption text-fg-subtle">Hali izoh yo‘q</p>
            ) : (
              <ul className="space-y-3">
                {task.comments.map((item) => (
                  <li key={item.id} className="rounded-md bg-surface-muted p-3">
                    <p className="text-caption text-fg-subtle">
                      {personName(item.author)} · {formatDateTime(item.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-body text-fg">{item.content}</p>
                  </li>
                ))}
              </ul>
            )}
            <form className="mt-3 space-y-2" onSubmit={onComment}>
              <Textarea aria-label="Izoh" rows={2} maxLength={2000} placeholder="Izoh yozing…" value={comment} onChange={(event) => setComment(event.target.value)} />
              <Button type="submit" size="sm" disabled={!comment.trim()} loading={addComment.isPending}>
                Izoh qo‘shish
              </Button>
            </form>
          </section>
        </div>
      ) : null}
      {editing && task && <TaskFormModal open task={task} canAssign={false} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}
