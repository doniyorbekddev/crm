import { z } from 'zod';

const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'], 'Ustuvorlik noto‘g‘ri');
const status = z.enum(['OPEN', 'DONE', 'CANCELLED'], 'Holat noto‘g‘ri');
const title = z.string('Sarlavha majburiy').trim().min(2, 'Sarlavha kamida 2 belgi').max(200, 'Sarlavha 200 belgidan oshmasin');
const description = z.string().trim().max(2000, 'Tavsif 2000 belgidan oshmasin');
const dueAt = z.coerce.date('Muddat noto‘g‘ri');
/** Faqat ilova ichidagi sahifa — tashqi manzilga havola bo'lmasin */
const link = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?!\/)/, 'Havola ilova ichidagi sahifa bo‘lishi kerak');

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

export const taskListQuerySchema = z.object({
  status: status.optional(),
  /** mine — menga biriktirilgan; created — men bergan; all — hammasi (`task.view_all`) */
  scope: z.enum(['mine', 'created', 'all']).default('mine'),
  priority: priority.optional(),
  assigneeId: z.string().trim().min(1).max(50).optional(),
  overdue: booleanFlag.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskCreateSchema = z.object({
  title,
  description: description.optional(),
  /** Berilmasa — o'zi uchun */
  assigneeId: z.string().trim().min(1).max(50).optional(),
  dueAt: dueAt.optional(),
  priority: priority.default('NORMAL'),
  entityType: z.string().trim().min(1).max(30).optional(),
  entityId: z.string().trim().min(1).max(50).optional(),
  link: link.optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

/** Avvalgi `PATCH /tasks/:id {status}` shakli saqlangan; qolgan maydonlar ixtiyoriy */
export const taskUpdateSchema = z
  .object({
    status: status.optional(),
    title: title.optional(),
    description: description.nullable().optional(),
    dueAt: dueAt.nullable().optional(),
    priority: priority.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'O‘zgartiriladigan maydon yo‘q');
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskAssignSchema = z.object({
  assigneeId: z.string('Ijrochi majburiy').trim().min(1).max(50),
  note: z.string().trim().max(500).optional(),
});
export type TaskAssignInput = z.infer<typeof taskAssignSchema>;

export const taskCommentSchema = z.object({
  content: z.string('Izoh majburiy').trim().min(1, 'Izoh bo‘sh bo‘lmasin').max(2000, 'Izoh 2000 belgidan oshmasin'),
});
export type TaskCommentInput = z.infer<typeof taskCommentSchema>;

/** Ogohlantirish / bildirishnomadan vazifa: hamma maydon ixtiyoriy — berilmagani manbadan olinadi */
export const taskFromSourceSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  assigneeId: z.string().trim().min(1).max(50).optional(),
  dueAt: dueAt.optional(),
  priority: priority.optional(),
});
