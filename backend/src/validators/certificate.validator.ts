import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

export const issueCertificateSchema = z.object({
  studentId: idSchema,
  /** Ko‘rsatilmasa o‘quvchining kursi olinadi */
  courseId: optionalField(idSchema),
  /** Ko‘rsatilmasa bugungi sana */
  completionDate: z.coerce.date().optional(),
  /** Yakuniy natija — ko‘rsatilmasa imtihon natijalaridan o‘rtacha olinadi */
  percentage: z.coerce.number().int().min(0).max(100).optional(),
  note: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
});

export const revokeCertificateSchema = z.object({
  reason: z.string('Sabab kiritilishi shart').trim().min(3, 'Sabab juda qisqa').max(255, 'Sabab juda uzun'),
});

export const certificateListQuerySchema = paginationQuerySchema.extend({
  studentId: optionalField(idSchema),
  courseId: optionalField(idSchema),
  includeRevoked: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;
export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;
export type CertificateListQuery = z.infer<typeof certificateListQuerySchema>;
