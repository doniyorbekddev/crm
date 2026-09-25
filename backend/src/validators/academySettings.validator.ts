import { z } from 'zod';
import { emailSchema, optionalField, phoneSchema } from './common.validator.js';

/**
 * Markaz ma'lumotlari (TZ 3.1 GAP-01). Qat'iy sxema — noma'lum maydon qabul qilinmaydi,
 * shuning uchun `Setting.value` ichiga faqat shu tuzilma yoziladi.
 */
export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
/**
 * Hozir faqat haqiqatda qo'llab-quvvatlanadiganlar: summalar va biznes qoidalari (eng kam to'lov
 * 1 000 so'm, Payme tiyin) so'mga bog'langan, interfeys faqat o'zbekcha. Boshqa valyuta yoki til —
 * alohida ish (qoidalar va tarjimalar); ro'yxatga qo'shish bilan "yoqilgan" deb ko'rsatilmaydi.
 */
export const ACADEMY_CURRENCIES = ['UZS'] as const;
export const ACADEMY_LANGUAGES = ['uz'] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt formati SS:DD (masalan 09:00)');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati YYYY-MM-DD');

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const workingDaySchema = z
  .object({
    day: z.enum(WEEKDAYS, 'Hafta kuni noto‘g‘ri'),
    isOpen: z.boolean(),
    from: time,
    to: time,
  })
  .strict()
  .refine((row) => !row.isOpen || row.from < row.to, { message: 'Tugash vaqti boshlanishdan keyin bo‘lishi kerak', path: ['to'] });

export const academySettingsSchema = z
  .object({
    name: z.string('Markaz nomi kiritilishi shart').trim().min(2, 'Nom kamida 2 belgi').max(120, 'Nom 120 belgidan oshmasin'),
    phone: optionalField(phoneSchema),
    email: optionalField(emailSchema),
    address: optionalField(z.string().trim().max(255, 'Manzil 255 belgidan oshmasin')),
    workingHours: z
      .array(workingDaySchema)
      .length(7, 'Haftaning 7 kuni ko‘rsatilishi kerak')
      .refine((rows) => new Set(rows.map((row) => row.day)).size === 7, 'Har kun bir marta ko‘rsatilishi kerak'),
    currency: z.enum(ACADEMY_CURRENCIES, 'Hozircha faqat UZS (so‘m)'),
    academicYear: z
      .object({ start: dateOnly, end: dateOnly })
      .strict()
      .refine((year) => year.start < year.end, { message: 'O‘quv yili tugashi boshlanishidan keyin bo‘lishi kerak', path: ['end'] })
      .refine((year) => (Date.parse(year.end) - Date.parse(year.start)) / 86_400_000 <= 400, { message: 'O‘quv yili 400 kundan uzun bo‘lmasin', path: ['end'] }),
    timezone: z.string().trim().min(1).max(64).refine(isTimeZone, 'Vaqt mintaqasi noto‘g‘ri (masalan Asia/Tashkent)'),
    defaultLanguage: z.enum(ACADEMY_LANGUAGES, 'Hozircha faqat o‘zbek tili (uz)'),
  })
  .strict();

export type AcademySettingsInput = z.infer<typeof academySettingsSchema>;
