import { z } from 'zod';

/** Vidjetlar tartibi va yashirilganlari */
const widgetLayoutSchema = z
  .object({
    order: z.array(z.string().trim().min(1).max(50)).max(30, 'Vidjetlar juda ko‘p'),
    hidden: z.array(z.string().trim().min(1).max(50)).max(30, 'Vidjetlar juda ko‘p'),
  })
  .strict()
  .refine((value) => new Set(value.order).size === value.order.length, { path: ['order'], message: 'Vidjet takrorlangan' });

/**
 * Jadval ustunlari (TZ 3.1 GAP-03): tartib — massiv tartibi, ko'rinish va kenglik (px, bo'lmasa — avto).
 * Bu faqat **ko'rinish** sozlamasi: yashirilgan ustun ma'lumoti API javobida baribir bor, ruxsatlar o'zgarmaydi.
 */
const tableColumnsSchema = z
  .object({
    columns: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, 'Ustun kaliti noto‘g‘ri'),
            visible: z.boolean(),
            width: z.number().int().min(60, 'Kenglik kamida 60px').max(640, 'Kenglik ko‘pi bilan 640px').nullable().optional(),
          })
          .strict(),
      )
      .max(40, 'Ustunlar juda ko‘p'),
  })
  .strict()
  .refine((value) => new Set(value.columns.map((column) => column.key)).size === value.columns.length, { path: ['columns'], message: 'Ustun takrorlangan' });

/** Ustun sozlamasi saqlanadigan jadvallar */
export const TABLE_PREFERENCE_NAMES = ['students', 'leads', 'payments', 'debts', 'groups', 'parents', 'teachers', 'employees'] as const;

const tableSchemas = Object.fromEntries(TABLE_PREFERENCE_NAMES.map((name) => [`table.${name}.columns`, tableColumnsSchema])) as Record<
  `table.${(typeof TABLE_PREFERENCE_NAMES)[number]}.columns`,
  typeof tableColumnsSchema
>;

/** Faqat shu kalitlar saqlanadi — ixtiyoriy JSON yig‘ilib qolmasin */
/** Ota-ona kabinetida tanlangan farzand — qurilmalar orasida saqlanadi */
const activeChildSchema = z.string().trim().min(1).max(50);

export const PREFERENCE_SCHEMAS = {
  'dashboard.layout': widgetLayoutSchema,
  'executive.layout': widgetLayoutSchema,
  'portal.activeChild': activeChildSchema,
  ...tableSchemas,
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_SCHEMAS;

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_SCHEMAS) as PreferenceKey[];

export const preferenceKeyParamSchema = z.object({
  key: z.enum(PREFERENCE_KEYS as [PreferenceKey, ...PreferenceKey[]], 'Bunday sozlama yo‘q'),
});
