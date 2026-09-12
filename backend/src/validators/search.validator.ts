import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z
    .string('Qidiruv so‘zini kiriting')
    .trim()
    .min(2, 'Kamida 2 ta belgi kiriting')
    .max(100, 'Qidiruv matni juda uzun'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
