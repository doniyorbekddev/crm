/**
 * Interfeys tillari. Manba til — o'zbekcha (lotin): koddagi barcha matnlar shu tilda yozilgan.
 * Boshqa tillar tarjima qatlami (`translator.ts`) orqali ko'rsatiladi.
 */
export const LANGUAGES = [
  { code: 'uz', label: 'O‘zbekcha', short: 'UZ', htmlLang: 'uz-Latn' },
  { code: 'uz-Cyrl', label: 'Ўзбекча', short: 'ЎЗ', htmlLang: 'uz-Cyrl' },
  { code: 'ru', label: 'Русский', short: 'RU', htmlLang: 'ru' },
  { code: 'en', label: 'English', short: 'EN', htmlLang: 'en' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];
export const SOURCE_LANGUAGE: Language = 'uz';
export const LANGUAGE_STORAGE_KEY = 'crm.language';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value);
}
