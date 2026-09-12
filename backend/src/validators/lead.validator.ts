import { z } from 'zod';
import type { LeadPriority, LeadStatus } from '../generated/prisma/client.js';
import { emailSchema, nameSchema, optionalField, paginationQuerySchema, phoneSchema } from './common.validator.js';

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'CALLBACK',
  'INTERESTED',
  'TRIAL_BOOKED',
  'TRIAL_ATTENDED',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const satisfies readonly LeadStatus[];

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const satisfies readonly LeadPriority[];

const idSchema = z.string().trim().min(1).max(50);

/** "NEW,CONTACTED" → ["NEW", "CONTACTED"] */
const statusListSchema = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : undefined,
  )
  .pipe(z.array(z.enum(LEAD_STATUSES, 'Status noto‘g‘ri')).optional());

export const leadFilterQuerySchema = z.object({
  search: paginationQuerySchema.shape.search,
  status: statusListSchema,
  sourceId: idSchema.optional(),
  courseId: idSchema.optional(),
  /** "me" — menga biriktirilgan, "unassigned" — biriktirilmagan, yoki xodim ID */
  assignedTo: idSchema.optional(),
  priority: z.enum(LEAD_PRIORITIES, 'Muhimlik noto‘g‘ri').optional(),
  createdFrom: z.coerce.date('Sana noto‘g‘ri').optional(),
  createdTo: z.coerce.date('Sana noto‘g‘ri').optional(),
  followUp: z.enum(['overdue', 'today', 'upcoming', 'none'], 'Follow-up filtri noto‘g‘ri').optional(),
});

export const leadListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  ...leadFilterQuerySchema.shape,
  sortBy: z.enum(['createdAt', 'updatedAt', 'nextFollowUpAt', 'firstName', 'priority', 'number']).default('createdAt'),
});

export const leadKanbanQuerySchema = leadFilterQuerySchema.omit({ status: true }).extend({
  perColumn: z.coerce.number().int().min(1).max(100).default(30),
});

const telegramSchema = z
  .string()
  .trim()
  .transform((value) => (value.startsWith('@') ? value : `@${value}`))
  .pipe(z.string().regex(/^@[A-Za-z0-9_]{3,63}$/, 'Telegram username noto‘g‘ri (masalan: @username)'));

const leadFieldsSchema = z.object({
  firstName: nameSchema('Ism'),
  lastName: optionalField(z.string().trim().max(100, 'Familiya juda uzun')),
  phone: phoneSchema,
  telegram: optionalField(telegramSchema),
  email: optionalField(emailSchema),
  age: optionalField(z.coerce.number('Yosh raqam bo‘lishi kerak').int().min(3, 'Yosh noto‘g‘ri').max(100, 'Yosh noto‘g‘ri')),
  gender: optionalField(z.enum(['MALE', 'FEMALE'], 'Jins noto‘g‘ri')),
  address: optionalField(z.string().trim().max(255, 'Manzil juda uzun')),
  sourceId: z.string('Manbani tanlang').trim().min(1, 'Manbani tanlang').max(50),
  courseId: optionalField(idSchema),
  priority: z.enum(LEAD_PRIORITIES, 'Muhimlik noto‘g‘ri').default('MEDIUM'),
  notes: optionalField(z.string().trim().max(2000, 'Izoh 2000 belgidan oshmasligi kerak')),
});

export const createLeadSchema = leadFieldsSchema.extend({
  assignedToId: optionalField(idSchema),
  /** Shu telefon raqamli lead mavjud bo‘lsa ham yaratish */
  allowDuplicate: z.boolean().default(false),
});

export const updateLeadSchema = leadFieldsSchema;

export const updateLeadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES, 'Status noto‘g‘ri'),
    lostReason: optionalField(z.string().trim().max(255, 'Sabab 255 belgidan oshmasligi kerak')),
    comment: optionalField(z.string().trim().max(500, 'Izoh 500 belgidan oshmasligi kerak')),
  })
  .refine((values) => values.status !== 'LOST' || Boolean(values.lostReason), {
    path: ['lostReason'],
    message: 'Yo‘qotilish sababini kiriting',
  });

export const assignLeadSchema = z.object({
  assignedToId: idSchema.nullable(),
});

export const leadActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createLeadNoteSchema = z.object({
  content: z.string('Izoh matnini kiriting').trim().min(1, 'Izoh matnini kiriting').max(2000, 'Izoh 2000 belgidan oshmasligi kerak'),
});

export const leadNoteParamsSchema = z.object({ id: idSchema, noteId: idSchema });

export type LeadFilterQuery = z.infer<typeof leadFilterQuerySchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadKanbanQuery = z.infer<typeof leadKanbanQuerySchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
export type LeadActivityQuery = z.infer<typeof leadActivityQuerySchema>;
export type CreateLeadNoteInput = z.infer<typeof createLeadNoteSchema>;
