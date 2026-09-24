import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

export const STOCK_MOVEMENT_TYPES = ['PURCHASE', 'SALE', 'RETURN', 'DAMAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'] as const;

export const productCategorySchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, 'Kalit juda qisqa')
    .max(50, 'Kalit juda uzun')
    .regex(/^[a-z0-9_]+$/, 'Kalit faqat kichik harf, raqam va pastki chiziqdan iborat bo‘lsin'),
  name: z.string().trim().min(2, 'Nom juda qisqa').max(100, 'Nom juda uzun'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const productSchema = z.object({
  id: optionalField(idSchema),
  sku: z.string().trim().min(1, 'Kodni kiriting').max(50, 'Kod juda uzun'),
  name: z.string().trim().min(2, 'Nom juda qisqa').max(150, 'Nom juda uzun'),
  categoryId: idSchema,
  unit: z.string().trim().min(1).max(20).default('dona'),
  price: z.coerce.number().min(0, 'Narx manfiy bo‘lmaydi').max(999_999_999).default(0),
  cost: z.coerce.number().min(0, 'Tannarx manfiy bo‘lmaydi').max(999_999_999).default(0),
  minQuantity: z.coerce.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
  note: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
});

export const stockMovementSchema = z.object({
  productId: idSchema,
  type: z.enum(STOCK_MOVEMENT_TYPES, 'Harakat turi noto‘g‘ri'),
  quantity: z.coerce.number().int().min(1, 'Miqdor kamida 1').max(100_000, 'Miqdor juda katta'),
  unitPrice: z.coerce.number().min(0).max(999_999_999).optional(),
  reason: optionalField(z.string().trim().max(255, 'Sabab juda uzun')),
  studentId: optionalField(idSchema),
  /** Inventarizatsiyada qoldiqni kamaytirish */
  decrease: z.boolean().default(false),
  /** Pul yozuvini shu harakat bilan birga yaratish */
  money: z
    .object({
      categoryId: idSchema,
      method: z.enum(['CASH', 'CARD', 'TRANSFER', 'ONLINE']).default('CASH'),
      accountId: optionalField(idSchema),
    })
    .optional(),
});

/** Filiallararo ko'chirish — pul yozuvi yo'q, shuning uchun `money` maydoni ham yo'q */
export const stockTransferSchema = z.object({
  productId: idSchema,
  toBranchId: idSchema,
  quantity: z.coerce.number().int().min(1, 'Miqdor kamida 1').max(100_000, 'Miqdor juda katta'),
  reason: optionalField(z.string().trim().max(255, 'Sabab juda uzun')),
});

export const productListQuerySchema = paginationQuerySchema.extend({
  categoryId: optionalField(idSchema),
  branchId: optionalField(idSchema),
  onlyLowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const movementListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  productId: optionalField(idSchema),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
});

export const inventoryStatsQuerySchema = z.object({ branchId: optionalField(idSchema) });

export type ProductInput = z.infer<typeof productSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
