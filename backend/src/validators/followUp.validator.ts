import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const FOLLOW_UP_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const FOLLOW_UP_SCOPES = ['all', 'overdue', 'today', 'tomorrow', 'upcoming', 'done'] as const;

const idSchema = z.string().trim().min(1).max(50);

export const followUpListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  scope: z.enum(FOLLOW_UP_SCOPES, 'Filtr noto‘g‘ri').default('all'),
  /** "me" — menga biriktirilganlar, yoki xodim ID */
  assignedTo: idSchema.optional(),
  leadId: idSchema.optional(),
});

export const followUpSummaryQuerySchema = z.object({
  assignedTo: idSchema.optional(),
  leadId: idSchema.optional(),
});

const followUpFieldsSchema = z.object({
  title: z.string('Vazifa nomini kiriting').trim().min(3, 'Kamida 3 belgi').max(200, 'Nom 200 belgidan oshmasligi kerak'),
  dueAt: z.coerce.date('Sana va vaqtni kiriting'),
  /** Bo‘sh bo‘lsa — muddatdan 30 daqiqa oldin */
  remindAt: optionalField(z.coerce.date('Sana noto‘g‘ri')),
  notes: optionalField(z.string().trim().max(2000, 'Izoh 2000 belgidan oshmasligi kerak')),
  assignedToId: optionalField(idSchema),
  /** Muhimlik (TZ 3.1 GAP-09); berilmasa — yaratishda MEDIUM, tahrirda o'zgarmaydi */
  priority: optionalField(z.enum(FOLLOW_UP_PRIORITIES, 'Muhimlik noto‘g‘ri')),
});

export const createFollowUpSchema = followUpFieldsSchema.extend({ leadId: idSchema });
export const updateFollowUpSchema = followUpFieldsSchema;

export const completeFollowUpSchema = z.object({
  comment: optionalField(z.string().trim().max(500, 'Izoh 500 belgidan oshmasligi kerak')),
  /** To‘ldirilsa — darhol keyingi follow-up yaratiladi */
  nextDueAt: optionalField(z.coerce.date('Sana noto‘g‘ri')),
  nextTitle: optionalField(z.string().trim().max(200, 'Nom 200 belgidan oshmasligi kerak')),
});

export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
export type FollowUpSummaryQuery = z.infer<typeof followUpSummaryQuerySchema>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
export type CompleteFollowUpInput = z.infer<typeof completeFollowUpSchema>;
