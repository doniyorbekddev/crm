export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskSource = 'MANUAL' | 'AUTOMATION' | 'ALERT' | 'NOTIFICATION' | 'ESCALATION';

export interface TaskPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  dueAt: string | null;
  overdue: boolean;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  assignee: TaskPerson;
  createdBy: TaskPerson | null;
  rule: { key: string; name: string } | null;
  alertId: string | null;
  commentCount: number;
  escalatedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskComment {
  id: string;
  content: string;
  author: TaskPerson | null;
  createdAt: string;
}

export interface TaskAssignment {
  id: string;
  from: TaskPerson | null;
  to: TaskPerson | null;
  changedBy: TaskPerson | null;
  note: string | null;
  createdAt: string;
}

export interface TaskDetail extends TaskItem {
  comments: TaskComment[];
  assignments: TaskAssignment[];
  can: { edit: boolean; assign: boolean; changeStatus: boolean };
}

export interface TaskList {
  items: TaskItem[];
  openCount: number;
  total: number;
  page: number;
  limit: number;
}

export interface TaskListParams {
  status?: TaskStatus;
  scope?: 'mine' | 'created' | 'all';
  priority?: TaskPriority;
  overdue?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaskCreatePayload {
  title: string;
  description?: string;
  assigneeId?: string;
  dueAt?: string;
  priority?: TaskPriority;
  entityType?: string;
  entityId?: string;
  link?: string;
}

export interface TaskAssignee extends TaskPerson {
  role: string;
}
