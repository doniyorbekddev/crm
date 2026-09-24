import { z } from 'zod';
import { optionalField } from './common.validator.js';

export const aiAskSchema = z.object({
  question: z.string('Savolni yozing').trim().min(3, 'Savol juda qisqa').max(500, 'Savol 500 belgidan oshmasligi kerak'),
  /** Taklif ro‘yxatidan tanlanganda — savolni tanish bosqichi o‘tkazib yuboriladi */
  toolKey: optionalField(z.string().trim().max(50)),
});

export type AiAskInput = z.infer<typeof aiAskSchema>;
