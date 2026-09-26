import { z } from 'zod';
import { optionalField } from './common.validator.js';

export const BROADCAST_AUDIENCES = ['STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'GROUP', 'COURSE'] as const;

/** Ommaviy xabar tugmalari: ko'pi bilan 3 ta (TZ 3.1 GAP-15) */
export const MAX_BROADCAST_BUTTONS = 3;

/**
 * Faqat `https://` — `javascript:`, `http:`, `tg:` va login/parol qo'shilgan manzillar rad etiladi
 * (xabar yuzlab chatga ketadi — bitta xato havola hammaga tarqaladi).
 */
export function isSafeButtonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const broadcastButtonSchema = z.object({
  text: z.string('Tugma matnini kiriting').trim().min(1, 'Tugma matnini kiriting').max(40, 'Tugma matni 40 belgidan oshmasin'),
  url: z.string('Havolani kiriting').trim().max(500, 'Havola juda uzun').refine(isSafeButtonUrl, 'Havola https:// bilan boshlanadigan to‘g‘ri manzil bo‘lsin'),
});

export type BroadcastButton = z.infer<typeof broadcastButtonSchema>;

export const broadcastSchema = z
  .object({
    audience: z.enum(BROADCAST_AUDIENCES, 'Auditoriya noto‘g‘ri'),
    /** GROUP/COURSE uchun majburiy */
    targetId: optionalField(z.string().trim().min(1).max(50)),
    /** Guruh/kurs auditoriyasida ota-onalarga ham yuborilsinmi */
    includeParents: z.boolean().default(false),
    message: z.string('Xabar matnini kiriting').trim().min(2, 'Xabar juda qisqa').max(2000, 'Xabar 2000 belgidan oshmasin'),
    /** Havola tugmalari (ixtiyoriy) */
    buttons: z.array(broadcastButtonSchema).max(MAX_BROADCAST_BUTTONS, `Ko‘pi bilan ${MAX_BROADCAST_BUTTONS} ta tugma`).default([]),
    /** Web: oldin yuklangan rasm/hujjat (`POST /telegram/broadcasts/media` javobi) */
    mediaToken: optionalField(z.string().trim().min(10).max(2000)),
  })
  .strict()
  .refine((values) => (values.audience !== 'GROUP' && values.audience !== 'COURSE') || Boolean(values.targetId), {
    path: ['targetId'],
    message: 'Guruh yoki kursni tanlang',
  });

export type BroadcastInput = z.infer<typeof broadcastSchema>;
