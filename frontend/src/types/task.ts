export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  overdue: boolean;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  assignee: { id: string; firstName: string; lastName: string };
  rule: { key: string; name: string } | null;
  createdAt: string;
  completedAt: string | null;
}
