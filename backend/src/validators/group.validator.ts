import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export const GROUP_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

const idSchema = z.string().trim().min(1).max(50);

/** "09:00" ko‘rinishidagi vaqt */
const timeSchema = z
  .string('Vaqtni kiriting')
  .trim()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Vaqt formati: 09:00');

export const groupListQuerySchema = paginationQuerySchema.extend({
  courseId: idSchema.optional(),
  teacherId: idSchema.optional(),
  status: z.enum(GROUP_STATUSES, 'Holat noto‘g‘ri').optional(),
  sortBy: z.enum(['name', 'startDate', 'createdAt']).default('startDate'),
});

const groupFieldsSchema = z.object({
  name: z.string('Guruh nomini kiriting').trim().min(2, 'Kamida 2 belgi').max(100, 'Nom 100 belgidan oshmasligi kerak'),
  courseId: z.string('Kursni tanlang').trim().min(1, 'Kursni tanlang').max(50),
  teacherId: optionalField(idSchema),
  room: optionalField(z.string().trim().max(50, 'Xona nomi juda uzun')),
  roomId: optionalField(z.string().trim().max(50)),
  /** Jadval to‘qnashuviga qaramay saqlash (masalan qo‘shma dars) */
  allowConflict: z.boolean().optional(),
  startDate: z.coerce.date('Boshlanish sanasini kiriting'),
  endDate: optionalField(z.coerce.date('Sana noto‘g‘ri')),
  scheduleDays: z
    .array(z.enum(WEEK_DAYS, 'Dars kuni noto‘g‘ri'), 'Dars kunlarini tanlang')
    .min(1, 'Kamida bitta dars kunini tanlang')
    .max(7, 'Kunlar noto‘g‘ri'),
  startTime: timeSchema,
  endTime: timeSchema,
  capacity: z.coerce
    .number('Sig‘im raqam bo‘lishi kerak')
    .int()
    .min(1, 'Sig‘im kamida 1 bo‘lishi kerak')
    .max(100, 'Sig‘im 100 dan oshmasligi kerak')
    .default(15),
  status: z.enum(GROUP_STATUSES, 'Holat noto‘g‘ri').default('PLANNED'),
});

export const createGroupSchema = groupFieldsSchema
  .refine((values) => values.endTime > values.startTime, {
    path: ['endTime'],
    message: 'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak',
  })
  .refine((values) => !values.endDate || values.endDate >= values.startDate, {
    path: ['endDate'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

export const updateGroupSchema = createGroupSchema;

export type GroupListQuery = z.infer<typeof groupListQuerySchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
