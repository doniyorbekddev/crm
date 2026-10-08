import type { BadgeTone } from '@/components/ui/Badge';
import type { TaskPriority, TaskSource, TaskStatus } from '@/types/task';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { OPEN: 'Ochiq', DONE: 'Bajarildi', CANCELLED: 'Bekor' };
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
