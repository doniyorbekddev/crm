import { z } from 'zod';
import { optionalField } from './common.validator.js';

const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const timeSchema = z
  .string('Vaqt kiritilishi shart')
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt "HH:mm" ko‘rinishida bo‘lishi kerak');

const roomFieldsSchema = z.object({
  key: z
    .string('Xona kaliti kiritilishi shart')
    .trim()
    .min(1, 'Kalit bo‘sh bo‘lmasin')
    .max(50, 'Kalit juda uzun')
    .regex(/^[A-Za-z0-9._-]+$/, 'Kalitda faqat harf, raqam, nuqta, tire va pastki chiziq bo‘lishi mumkin'),
  name: z.string('Xona nomi kiritilishi shart').trim().min(1, 'Nom bo‘sh bo‘lmasin').max(100, 'Nom juda uzun'),
  capacity: z.coerce.number().int().min(1, 'Sig‘im kamida 1').max(500, 'Sig‘im juda katta'),
  equipment: z.array(z.string().trim().min(1).max(60)).max(20, 'Jihozlar juda ko‘p').optional(),
  note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const createRoomSchema = roomFieldsSchema.extend({
  capacity: roomFieldsSchema.shape.capacity.default(15),
  equipment: roomFieldsSchema.shape.equipment.default([]),
  isActive: roomFieldsSchema.shape.isActive.default(true),
  sortOrder: roomFieldsSchema.shape.sortOrder.default(0),
});

/** Kalit yaratilgandan keyin o‘zgarmaydi — unga guruhlar bog‘langan */
export const updateRoomSchema = roomFieldsSchema.omit({ key: true }).partial();

export const roomListQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

/** Saqlashdan oldin jadvalni tekshirish uchun */
export const conflictCheckSchema = z
  .object({
    groupId: optionalField(z.string().trim().max(50)),
    roomId: optionalField(z.string().trim().max(50)),
    teacherId: optionalField(z.string().trim().max(50)),
    scheduleDays: z.array(z.enum(WEEK_DAYS)).min(1, 'Kamida bitta kun tanlanishi kerak'),
    startTime: timeSchema,
    endTime: timeSchema,
    startDate: z.coerce.date('Boshlanish sanasi noto‘g‘ri'),
    endDate: z.coerce.date().optional(),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: 'Dars tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak',
    path: ['endTime'],
  });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type RoomListQuery = z.infer<typeof roomListQuerySchema>;
export type ConflictCheckInput = z.infer<typeof conflictCheckSchema>;
