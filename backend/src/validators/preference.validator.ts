import { z } from 'zod';

/** Vidjetlar tartibi va yashirilganlari */
const widgetLayoutSchema = z
  .object({
    order: z.array(z.string().trim().min(1).max(50)).max(30, 'Vidjetlar juda ko‘p'),
    hidden: z.array(z.string().trim().min(1).max(50)).max(30, 'Vidjetlar juda ko‘p'),
  })
  .strict()
  .refine((value) => new Set(value.order).size === value.order.length, { path: ['order'], message: 'Vidjet takrorlangan' });

/** Faqat shu kalitlar saqlanadi — ixtiyoriy JSON yig‘ilib qolmasin */
/** Ota-ona kabinetida tanlangan farzand — qurilmalar orasida saqlanadi */
const activeChildSchema = z.string().trim().min(1).max(50);

export const PREFERENCE_SCHEMAS = {
  'dashboard.layout': widgetLayoutSchema,
  'executive.layout': widgetLayoutSchema,
  'portal.activeChild': activeChildSchema,
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_SCHEMAS;

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_SCHEMAS) as PreferenceKey[];

export const preferenceKeyParamSchema = z.object({
  key: z.enum(PREFERENCE_KEYS as [PreferenceKey, ...PreferenceKey[]], 'Bunday sozlama yo‘q'),
});
