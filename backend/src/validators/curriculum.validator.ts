import { z } from 'zod';
import { optionalField } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

export const moduleFieldsSchema = z.object({
  title: z.string('Modul nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(150, 'Nom juda uzun'),
  description: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const createModuleSchema = moduleFieldsSchema.extend({
  isActive: moduleFieldsSchema.shape.isActive.default(true),
});
export const updateModuleSchema = moduleFieldsSchema.partial();

export const topicFieldsSchema = z.object({
  title: z.string('Mavzu nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(150, 'Nom juda uzun'),
  description: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  lessonCount: z.coerce.number().int().min(1, 'Kamida 1 dars').max(100, 'Juda ko‘p').optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const createTopicSchema = topicFieldsSchema.extend({
  lessonCount: topicFieldsSchema.shape.lessonCount.default(1),
  isActive: topicFieldsSchema.shape.isActive.default(true),
});
export const updateTopicSchema = topicFieldsSchema.partial();

/** Mavzuni o‘tilgan deb belgilash: butun guruh yoki tanlangan o‘quvchilar */
export const markTopicSchema = z
  .object({
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'], 'Holat noto‘g‘ri').default('COMPLETED'),
    groupId: optionalField(idSchema),
    studentIds: z.array(idSchema).max(200, 'Juda ko‘p o‘quvchi').optional(),
    note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  })
  .refine((value) => Boolean(value.groupId) || (value.studentIds?.length ?? 0) > 0, {
    message: 'Guruh yoki o‘quvchilar ro‘yxatini ko‘rsating',
    path: ['groupId'],
  });

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type MarkTopicInput = z.infer<typeof markTopicSchema>;
