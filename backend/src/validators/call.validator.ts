import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const CALL_RESULTS = ['ANSWERED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'INTERESTED', 'NOT_INTERESTED', 'CALLBACK'] as const;
export const CALL_STATUSES = ['PLANNED', 'COMPLETED', 'CANCELLED'] as const;
export const CALL_DIRECTIONS = ['OUTGOING', 'INCOMING'] as const;

const idSchema = z.string().trim().min(1).max(50);

export const callListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  leadId: idSchema.optional(),
  /** "me" — o‘zimning qo‘ng‘iroqlarim, yoki xodim ID */
  managerId: idSchema.optional(),
  result: z.enum(CALL_RESULTS, 'Natija noto‘g‘ri').optional(),
  status: z.enum(CALL_STATUSES, 'Holat noto‘g‘ri').optional(),
  direction: z.enum(CALL_DIRECTIONS, 'Yo‘nalish noto‘g‘ri').optional(),
  dateFrom: z.coerce.date('Sana noto‘g‘ri').optional(),
  dateTo: z.coerce.date('Sana noto‘g‘ri').optional(),
});

const callFieldsSchema = z.object({
  direction: z.enum(CALL_DIRECTIONS, 'Yo‘nalish noto‘g‘ri').default('OUTGOING'),
  status: z.enum(CALL_STATUSES, 'Holat noto‘g‘ri').default('COMPLETED'),
  result: optionalField(z.enum(CALL_RESULTS, 'Natija noto‘g‘ri')),
  calledAt: optionalField(z.coerce.date('Sana noto‘g‘ri')),
  /** Suhbat davomiyligi (soniya) */
  durationSec: z.coerce.number('Davomiylik raqam bo‘lishi kerak').int().min(0).max(86400, 'Davomiylik juda katta').default(0),
  notes: optionalField(z.string().trim().max(2000, 'Izoh 2000 belgidan oshmasligi kerak')),
  /** To‘ldirilsa — shu vaqtga avtomatik follow-up yaratiladi */
  nextCallAt: optionalField(z.coerce.date('Sana noto‘g‘ri')),
});

export const createCallSchema = callFieldsSchema.extend({ leadId: idSchema });
export const updateCallSchema = callFieldsSchema;

export type CallListQuery = z.infer<typeof callListQuerySchema>;
export type CreateCallInput = z.infer<typeof createCallSchema>;
export type UpdateCallInput = z.infer<typeof updateCallSchema>;
