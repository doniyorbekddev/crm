import { z } from 'zod';
import { optionalField } from './common.validator.js';

export const BROADCAST_AUDIENCES = ['STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'GROUP', 'COURSE'] as const;

export const broadcastSchema = z
  .object({
    audience: z.enum(BROADCAST_AUDIENCES, 'Auditoriya noto‘g‘ri'),
    /** GROUP/COURSE uchun majburiy */
    targetId: optionalField(z.string().trim().min(1).max(50)),
    /** Guruh/kurs auditoriyasida ota-onalarga ham yuborilsinmi */
    includeParents: z.boolean().default(false),
    message: z.string('Xabar matnini kiriting').trim().min(2, 'Xabar juda qisqa').max(2000, 'Xabar 2000 belgidan oshmasin'),
  })
  .refine((values) => (values.audience !== 'GROUP' && values.audience !== 'COURSE') || Boolean(values.targetId), {
    path: ['targetId'],
    message: 'Guruh yoki kursni tanlang',
  });

export type BroadcastInput = z.infer<typeof broadcastSchema>;
