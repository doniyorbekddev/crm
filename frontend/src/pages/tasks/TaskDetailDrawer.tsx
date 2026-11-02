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
import { useAuthStore } from '@/store/auth.store';
import type { TaskDetail, TaskStatus } from '@/types/task';
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_TONES, TASK_SOURCE_LABELS, isWorking, personName, taskStatusBadge } from './taskLabels';

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
            <Badge tone={taskStatusBadge(task).tone}>{taskStatusBadge(task).label}</Badge>
            <Badge tone={TASK_PRIORITY_TONES[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
            <Badge tone="gray">{TASK_SOURCE_LABELS[task.source]}</Badge>
          </div>
          {task.description && <p className="whitespace-pre-line text-body text-fg-muted">{task.description}</p>}
          {task.expectedResult && (
            <div className="rounded-md border border-border p-3">
              <p className="text-caption text-fg-subtle">Kutilgan natija</p>
              <p className="mt-1 whitespace-pre-line text-body text-fg">{task.expectedResult}</p>
            </div>
          )}
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
            {task.submittedAt && (
              <div>
                <dt className="text-caption text-fg-subtle">Topshirilgan</dt>
                <dd className="text-fg">{formatDateTime(task.submittedAt)}</dd>
              </div>
            )}
          </dl>
          <StatusActions task={task} onDone={refresh} />
          {task.can.edit && isWorking(task.status) && (
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

          {task.can.assign && isWorking(task.status) && (
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

/**
 * Holat tugmalari: ijrochi — boshlash va topshirish (yoki o'z vazifasini yopish); bergan xodim yoki rahbar —
 * qabul qilish, izoh bilan qaytarish, bekor qilish va qayta ochish. Server qoidani baribir tekshiradi.
 */
function StatusActions({ task, onDone }: { task: TaskDetail; onDone: () => void }) {
  const userId = useAuthStore((state) => state.user?.id);
  const [note, setNote] = useState('');
  const [returning, setReturning] = useState(false);
  const change = useMutation({
    mutationFn: ({ status, comment }: { status: TaskStatus; comment?: string }) => taskService.setStatus(task.id, status, comment),
    onSuccess: (result) => {
      toast.success(result.message);
      setNote('');
      setReturning(false);
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const mine = task.assignee.id === userId;
  const decides = !task.needsReview || (task.can.edit && !mine);
  const run = (status: TaskStatus, comment?: string) => change.mutate({ status, ...(comment ? { comment } : {}) });

  const buttons: Array<{ label: string; status: TaskStatus; variant?: 'secondary' | 'ghost' }> = [];
  if (isWorking(task.status) && task.can.changeStatus) {
    if (mine && task.status === 'OPEN') buttons.push({ label: 'Boshlash', status: 'IN_PROGRESS', variant: 'secondary' });
    if (mine && task.needsReview) buttons.push({ label: 'Tekshiruvga topshirish', status: 'REVIEW' });
    else if (decides) buttons.push({ label: 'Bajarildi', status: 'DONE' });
    if (decides) buttons.push({ label: 'Bekor qilish', status: 'CANCELLED', variant: 'ghost' });
  }
  if (task.status === 'REVIEW' && task.can.review) buttons.push({ label: 'Qabul qilish', status: 'DONE' });
  if ((task.status === 'DONE' || task.status === 'CANCELLED') && decides && task.can.changeStatus) buttons.push({ label: 'Qayta ochish', status: 'OPEN', variant: 'secondary' });
  const canReturn = task.status === 'REVIEW' && task.can.review;
  if (buttons.length === 0 && !canReturn) {
    return task.status === 'REVIEW' && mine ? <p className="text-caption text-fg-subtle">Tekshiruvga topshirilgan — vazifani bergan xodim qabul qiladi.</p> : null;
  }

  return (
    <section aria-label="Holatni o‘zgartirish" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => (
          <Button key={button.label} size="sm" variant={button.variant} loading={change.isPending && change.variables?.status === button.status} onClick={() => run(button.status)}>
            {button.label}
          </Button>
        ))}
        {canReturn && !returning && (
          <Button size="sm" variant="secondary" onClick={() => setReturning(true)}>
            Qaytarish
          </Button>
        )}
      </div>
      {returning && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim()) run('IN_PROGRESS', note.trim());
          }}
        >
          <Textarea aria-label="Qaytarish sababi" rows={2} maxLength={1000} placeholder="Nima qayta ishlanishi kerak?" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!note.trim()} loading={change.isPending}>
              Qaytarish
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReturning(false)}>
              Bekor
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
