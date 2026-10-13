import type { Language } from './languages';
import { toCyrillic } from './transliterate';

/**
 * Tarjima funksiyasi: o'zbekcha (lotin) manba matn → tanlangan til.
 *
 * Lug'at kaliti — manba matnning o'zi. Ikki tur yozuv:
 *  - `exact`: to'liq matn ("Saqlash" → "Сохранить");
 *  - `patterns`: o'zgaruvchili matn ("{0} ta ochiq ish" → "{0} открытых задач"). `{n}` o'rniga kelgan qism
 *    (son, ism, sana) o'zi alohida tarjima qilinadi — lug'atda bo'lsa; bo'lmasa o'z holicha qoladi.
 *
 * Lug'atda yo'q matn O'ZGARMAYDI. Bu ataylab: ekrandagi matnning katta qismi foydalanuvchi ma'lumoti
 * (ism, guruh nomi, izoh) — ularni "tarjima" qilish xato bo'lardi.
 *
 * Kirill: alohida lug'at yo'q — ma'lum interfeys matnlari algoritm bilan o'giriladi (`toCyrillic`).
 */
export interface Catalog {
  exact: Record<string, string>;
  patterns: Record<string, string>;
}

/** Faqat manba matnlar ro'yxati (kirill uchun — nimani o'girish mumkinligini bilish uchun) */
export interface SourceCatalog {
  exact: string[];
  patterns: string[];
}

export type Translate = (text: string) => string;

interface CompiledPattern {
  regex: RegExp;
  template: string;
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "{0} ta ochiq ish" → /^(.+?) ta ochiq ish$/; o'zgarmas qismi juda qisqa shablonlar tashlab yuboriladi (hamma narsaga mos kelardi) */
function compile(source: string, template: string): CompiledPattern | null {
  const literal = source.replace(/\{\d+\}/g, '');
  if (literal.replace(/[^\p{L}]/gu, '').length < 2) return null;
  // Bir so'zli shablon ("{0} dars", "{0} guruh") faqat SON bilan ishlaydi. Aks holda foydalanuvchi yozgan matn
  // ("Birinchi dars") yarim tarjima bo'lib qolardi ("Birinchi урок").
  // Yorliqli shablon ("Muddat: {0}", "{0} — bajarildi") bundan mustasno: ajratuvchi belgi chegarani aniq qiladi.
  const numericOnly = (literal.match(/\p{L}+/gu) ?? []).length <= 1 && !/[:—·()«»,!?]/.test(literal);
  const order: number[] = [];
  const body = source
    .split(/(\{\d+\})/)
    .map((part) => {
      const placeholder = /^\{(\d+)\}$/.exec(part);
      if (!placeholder) return escapeRegex(part);
      order.push(Number(placeholder[1]));
      return numericOnly ? '(-?\\d[\\d\\s.,:%/+–—-]*)' : '(.+?)';
    })
    .join('');
  // Guruh tartibi manbadagi tartib bo'yicha — tarjimada {1} {0} dan oldin kelishi mumkin
  const remapped = template.replace(/\{(\d+)\}/g, (_match, index: string) => `{${order.indexOf(Number(index))}}`);
  return { regex: new RegExp(`^${body}$`, 'su'), template: remapped };
}

const CACHE_LIMIT = 5_000;

export function createTranslator(exact: ReadonlyMap<string, string>, patternEntries: ReadonlyArray<readonly [string, string]>): Translate {
  // Eng aniq (o'zgarmas qismi uzun) shablon birinchi sinaladi
  const patterns = patternEntries
    .map(([source, template]) => ({ compiled: compile(source, template), weight: source.replace(/\{\d+\}/g, '').length }))
    .filter((entry): entry is { compiled: CompiledPattern; weight: number } => entry.compiled !== null)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.compiled);
  const cache = new Map<string, string | null>();

  const lookup = (key: string, allowPatterns: boolean): string | null => {
    const direct = exact.get(key);
    if (direct !== undefined) return direct;
    if (!allowPatterns) return null;
    for (const pattern of patterns) {
      const match = pattern.regex.exec(key);
      if (!match) continue;
      // O'rniga kelgan qismlar faqat to'liq mos kelsa tarjima qilinadi (shablon ichida shablon yo'q — cheksiz aylanish bo'lmasin)
      return pattern.template.replace(/\{(\d+)\}/g, (_match, index: string) => {
        const captured = match[Number(index) + 1] ?? '';
        return lookup(normalize(captured), false) ?? captured;
      });
    }
    return null;
  };

  return (text) => {
    // Harfsiz matn (son, tinish belgisi) — tarjima qilinadigan narsa yo'q
    if (!/\p{L}/u.test(text)) return text;
    const key = normalize(text);
    let result = cache.get(key);
    if (result === undefined) {
      result = lookup(key, true);
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, result);
    }
    if (result === null) return text;
    // Chetdagi bo'sh joylar saqlanadi: qo'shni matn bo'laklari yopishib qolmasin
    const leading = /^\s*/.exec(text)![0];
    const trailing = /\s*$/.exec(text)![0];
    return `${leading}${result}${trailing}`;
  };
}

export function translatorFromCatalog(catalog: Catalog): Translate {
  return createTranslator(new Map(Object.entries(catalog.exact)), Object.entries(catalog.patterns));
}

/** Kirill: ma'lum interfeys matnlari algoritm bilan o'giriladi */
export function cyrillicTranslator(source: SourceCatalog): Translate {
  return createTranslator(
    new Map(source.exact.map((text) => [text, toCyrillic(text)])),
    source.patterns.map((text) => [text, toCyrillic(text)] as const),
  );
}

/** Til lug'ati alohida bo'lak sifatida yuklanadi — standart tilda (o'zbekcha) hech narsa yuklanmaydi */
export async function loadTranslator(language: Language): Promise<Translate | null> {
  switch (language) {
    case 'uz':
      return null;
    case 'uz-Cyrl':
      return cyrillicTranslator((await import('./catalog/source.json')).default as SourceCatalog);
    case 'ru':
      return translatorFromCatalog((await import('./catalog/ru.json')).default as Catalog);
    case 'en':
      return translatorFromCatalog((await import('./catalog/en.json')).default as Catalog);
  }
}
