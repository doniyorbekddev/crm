/**
 * Topshiriqlar o'xshashligi (TZ 3.0 §36) — **signal, hukm emas**. Til modelisiz, lokal:
 * matn normallashtiriladi, so'z 5-gramlari (shingle) to'plami olinadi va Jaccard o'lchanadi.
 * Natija "Yuqori o'xshashlik aniqlandi" kabi ogohlantirish; "ko'chirildi" degan xulosa chiqarilmaydi.
 */

export const HIGH_SIMILARITY = 0.6;
const SHINGLE = 5;
/** Juda qisqa javoblar (masalan "bajarildi") solishtirilmaydi — tasodifiy moslik ko'p */
const MIN_TOKENS = 12;

/** Kod va matn uchun umumiy normallashtirish: izohlar, bo'shliqlar, katta-kichik harf */
export function tokenize(value: string): string[] {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .split(/[^\p{L}\p{N}_$]+/u)
    .filter(Boolean);
}

export function shingles(tokens: readonly string[], size = SHINGLE): Set<string> {
  const result = new Set<string>();
  if (tokens.length < size) {
    if (tokens.length > 0) result.add(tokens.join(' '));
    return result;
  }
  for (let index = 0; index + size <= tokens.length; index += 1) result.add(tokens.slice(index, index + size).join(' '));
  return result;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / (a.size + b.size - common);
}

export interface SimilarityInput {
  id: string;
  text: string;
  linkUrl?: string | null;
}

export interface SimilarityPair {
  a: string;
  b: string;
  /** 0–100 */
  score: number;
  /** Bir xil havola (masalan bitta repozitoriy) */
  sameLink: boolean;
}

/** Barcha juftliklar orasidan yuqori o'xshashlarini topadi (kamayish tartibida) */
export function similarPairs(items: readonly SimilarityInput[], threshold = HIGH_SIMILARITY): SimilarityPair[] {
  const prepared = items.map((item) => {
    const tokens = tokenize(item.text);
    return { id: item.id, set: tokens.length >= MIN_TOKENS ? shingles(tokens) : new Set<string>(), link: item.linkUrl?.trim().toLowerCase().replace(/\/+$/, '') || null };
  });
  const pairs: SimilarityPair[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const left = prepared[i]!;
      const right = prepared[j]!;
      const score = jaccard(left.set, right.set);
      const sameLink = left.link !== null && left.link === right.link;
      if (score >= threshold || sameLink) pairs.push({ a: left.id, b: right.id, score: Math.round(score * 100), sameLink });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

export interface CodeFinding {
  area: 'security' | 'bestPractice' | 'quality' | 'accessibility' | 'completeness';
  text: string;
}

/**
 * Tez, deterministik kod tekshiruvi (TZ §35) — til modelisiz ham ishlaydi. Faqat aniq naqshlar:
 * xavfsizlik (eval, innerHTML), eskirgan uslub (var, ==), accessibility (alt'siz img), tugallanmagan
 * joylar (TODO), qoldiq debug. To'g'rilikni baholamaydi — buni o'qituvchi (yoki ulangan model) qiladi.
 */
export function codeFindings(code: string, language: string | null): CodeFinding[] {
  const findings: CodeFinding[] = [];
  const lang = (language ?? '').toLowerCase();
  const isScript = ['javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx', 'react', 'nextjs', ''].includes(lang);
  const isMarkup = ['html', 'jsx', 'tsx', 'react', 'nextjs', ''].includes(lang) || /<\w+[\s>]/.test(code);
  if (isScript && /\beval\s*\(/.test(code)) findings.push({ area: 'security', text: '`eval()` ishlatilgan — xavfsizlik va tezlik uchun tavsiya etilmaydi' });
  if (isScript && /\.innerHTML\s*=/.test(code)) findings.push({ area: 'security', text: '`innerHTML` ga qiymat yozilgan — foydalanuvchi matni bo‘lsa XSS xavfi; `textContent` afzal' });
  if (isScript && /(^|[^\w.])var\s+\w/m.test(code)) findings.push({ area: 'bestPractice', text: '`var` o‘rniga `let`/`const` ishlatish tavsiya etiladi' });
  if (isScript && /[^=!]==[^=]/.test(code)) findings.push({ area: 'bestPractice', text: '`==` o‘rniga qat’iy `===` solishtirish tavsiya etiladi' });
  if (isScript && /console\.log\(/.test(code)) findings.push({ area: 'quality', text: '`console.log` qoldiqlari bor — topshirishdan oldin olib tashlash mumkin' });
  if (isMarkup && /<img\b(?![^>]*\balt=)[^>]*>/i.test(code)) findings.push({ area: 'accessibility', text: '`<img>` da `alt` atributi yo‘q — ekran o‘quvchilar uchun kerak' });
  if (isMarkup && /\sstyle="[^"]{40,}"/i.test(code)) findings.push({ area: 'quality', text: 'Uzun inline `style` — CSS klasslarga ko‘chirish tavsiya etiladi' });
  if (/\b(TODO|FIXME)\b/.test(code)) findings.push({ area: 'completeness', text: 'Kodda `TODO`/`FIXME` qolgan — vazifa to‘liq tugallanmagan bo‘lishi mumkin' });
  return findings;
}
