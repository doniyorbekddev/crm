import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { taskService } from '@/services/task.service';
import type { TaskCreatePayload, TaskItem, TaskPriority } from '@/types/task';
import { TASK_PRIORITY_LABELS } from './taskLabels';

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Boshqa xodimga berish mumkinmi (`task.assign`) */
  canAssign: boolean;
  /** Ogohlantirish yoki boshqa sahifadan ochilganda oldindan to'ldirish */
  initial?: Partial<Pick<TaskCreatePayload, 'title' | 'description' | 'link' | 'entityType' | 'entityId' | 'priority'>>;
  /** Standart `POST /tasks` o'rniga boshqa manba (masalan ogohlantirishdan vazifa) */
  submit?: (payload: TaskCreatePayload) => Promise<{ message: string }>;
  /** Berilsa — tahrirlash rejimi: sarlavha, tavsif, muddat va ustuvorlik o'zgartiriladi (ijrochi alohida biriktiriladi) */
  task?: Pick<TaskItem, 'id' | 'title' | 'description' | 'dueAt' | 'priority'>;
}

/** ISO vaqt → `datetime-local` qiymati (qurilma vaqti bo'yicha) */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Vazifa formasi: yangi (o'zi uchun yoki ruxsat bo'lsa boshqa xodimga) yoki mavjudini tahrirlash */
export function TaskFormModal({ open, onClose, canAssign, initial, submit, task }: TaskFormModalProps) {
  const editing = Boolean(task);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? initial?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? initial?.description ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState(toLocalInput(task?.dueAt));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? initial?.priority ?? 'NORMAL');
  const [touched, setTouched] = useState(false);
  const assignees = useQuery({ queryKey: ['tasks', 'assignees'], queryFn: () => taskService.assignees(), enabled: open && canAssign && !editing, staleTime: 60_000 });

  const titleError = touched && title.trim().length < 2 ? 'Sarlavha kamida 2 belgi' : undefined;

  const create = useMutation({
    mutationFn: (payload: TaskCreatePayload) => {
      // Tahrirlashda bo'shatilgan tavsif va muddat ham yuboriladi (null — olib tashlash)
      if (task) return taskService.update(task.id, { title: payload.title, description: payload.description ?? null, dueAt: payload.dueAt ?? null, ...(payload.priority ? { priority: payload.priority } : {}) });
      return submit ? submit(payload) : taskService.create(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (title.trim().length < 2) return;
    create.mutate({
      title: title.trim(),
      priority,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      ...(initial?.link ? { link: initial.link } : {}),
      ...(initial?.entityType && initial.entityId ? { entityType: initial.entityType, entityId: initial.entityId } : {}),
    });
  };

  return (
    <Modal
      open={open}
      title={editing ? 'Vazifani tahrirlash' : 'Yangi vazifa'}
      onClose={onClose}
      closeDisabled={create.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="task-form" loading={create.isPending}>
            {editing ? 'Saqlash' : 'Yaratish'}
          </Button>
        </>
      }
    >
      <form id="task-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        <FormField label="Sarlavha" htmlFor="task-title" required error={titleError}>
          <Input
            id="task-title"
            value={title}
            maxLength={200}
            invalid={Boolean(titleError)}
            aria-describedby={titleError ? fieldErrorId('task-title') : undefined}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </FormField>
        <FormField label="Tavsif" htmlFor="task-description">
          <Textarea id="task-description" rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Muddat" htmlFor="task-due">
            <Input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </FormField>
          <FormField label="Ustuvorlik" htmlFor="task-priority">
            <Select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((key) => (
                <option key={key} value={key}>
                  {TASK_PRIORITY_LABELS[key]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {canAssign && !editing && (
          <FormField label="Ijrochi" htmlFor="task-assignee" hint="Tanlanmasa — vazifa o‘zingizga">
            <Select id="task-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={assignees.isPending}>
              <option value="">O‘zim</option>
              {(assignees.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                  {user.role ? ` · ${user.role}` : ''}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </form>
    </Modal>
  );
}
