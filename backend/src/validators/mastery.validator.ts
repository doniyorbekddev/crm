import { z } from 'zod';

const percent = z.coerce.number('Raqam kiriting').int('Butun son kiriting').min(1, '1–99 oralig‘ida').max(99, '1–99 oralig‘ida');
const weight = z.coerce.number('Raqam kiriting').int('Butun son kiriting').min(0, '0–100 oralig‘ida').max(100, '0–100 oralig‘ida');

/** Mavzu o'zlashtirish sozlamalari (TZ §27: chegaralar sozlanadi) */
export const masterySettingsSchema = z.object({
  thresholds: z.object({ developing: percent, good: percent, mastered: percent }),
  weights: z.object({ exam: weight, homework: weight, attendance: weight, lessons: weight }),
});
