import type { BadgeTone } from '@/components/ui/Badge';
import type { TaskItem, TaskPriority, TaskSource, TaskStatus } from '@/types/task';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { OPEN: 'Yangi', IN_PROGRESS: 'Jarayonda', REVIEW: 'Tekshiruvda', DONE: 'Bajarildi', CANCELLED: 'Bekor' };
export const TASK_STATUS_TONES: Record<TaskStatus, BadgeTone> = { OPEN: 'blue', IN_PROGRESS: 'blue', REVIEW: 'yellow', DONE: 'green', CANCELLED: 'gray' };

/** Hali yopilmagan va ijrochi ishlayotgan holatlar */
export const isWorking = (status: TaskStatus) => status === 'OPEN' || status === 'IN_PROGRESS';

/** Holat belgisi: muddati o'tgani alohida ko'rsatiladi */
export function taskStatusBadge(task: Pick<TaskItem, 'status' | 'overdue'>): { label: string; tone: BadgeTone } {
  return task.overdue ? { label: 'Muddati o‘tgan', tone: 'red' } : { label: TASK_STATUS_LABELS[task.status], tone: TASK_STATUS_TONES[task.status] };
}
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: 'Past', NORMAL: 'Oddiy', HIGH: 'Yuqori', URGENT: 'Shoshilinch' };
export const TASK_PRIORITY_TONES: Record<TaskPriority, BadgeTone> = { LOW: 'gray', NORMAL: 'gray', HIGH: 'yellow', URGENT: 'red' };
export const TASK_SOURCE_LABELS: Record<TaskSource, string> = {
  MANUAL: 'Qo‘lda',
  AUTOMATION: 'Avtomatlashtirish',
  ALERT: 'Ogohlantirishdan',
  NOTIFICATION: 'Bildirishnomadan',
  ESCALATION: 'Eskalatsiya',
};

export function personName(person: { firstName: string; lastName: string } | null | undefined): string {
  return person ? `${person.firstName} ${person.lastName}`.trim() : '—';
}
