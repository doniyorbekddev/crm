import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(50);

/** §41: remedial reja — guruh, zaif mavzu, ixtiyoriy tanlangan o'quvchilar */
export const remedialSchema = z.object({
  groupId: idSchema,
  topicId: idSchema,
  studentIds: z.array(idSchema).max(100).optional(),
});

/** Tasdiqlash: vazifa tahlilida ball (tahrirlangan bo'lishi mumkin) va izoh */
export const acceptAnalysisSchema = z.object({
  score: z.coerce.number('Ball raqam bo‘lishi kerak').int().min(0).max(1000).optional(),
  feedback: z.string().trim().max(500, 'Izoh juda uzun').optional(),
});
