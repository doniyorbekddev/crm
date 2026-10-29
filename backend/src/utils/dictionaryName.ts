/**
 * Ma'lumotnomalar (kategoriya, manba, xona, turkum…) uchun umumiy qoidalar:
 * foydalanuvchi faqat nom yozadi, ichki kalit nomdan yasaladi, bir xil nom ikki marta yaratilmaydi.
 */

/** Nomlarni solishtirish: katta-kichik harf, apostrof turi (‘ ’ ʻ ʼ ') va bo'shliqlar farq qilmaydi */
export function dictionaryNameKey(name: string): string {
  return name.toLocaleLowerCase('uz').replace(/[‘’ʻʼ`']/g, "'").replace(/\s+/g, ' ').trim();
}

export function sameDictionaryName(a: string, b: string): boolean {
  return dictionaryNameKey(a) === dictionaryNameKey(b);
}

interface UniqueKeyOptions {
  /** Nomda lotin harf/raqam qolmasa */
  fallback?: string;
  /** Ba'zi jadvallar kalitni kichik harfda saqlaydi (`office_supplies`) */
  lowercase?: boolean;
  maxLength?: number;
}

/** "Ofis ta’miri" → "OFIS_TAMIRI"; band bo'lsa "_2", "_3"… (kalit faqat ichki identifikator) */
export function uniqueDictionaryKey(name: string, taken: ReadonlySet<string>, options: UniqueKeyOptions = {}): string {
  const { fallback = 'ITEM', lowercase = false, maxLength = 40 } = options;
  const upper =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‘’ʻʼ`']/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength) || fallback;
  const base = lowercase ? upper.toLowerCase() : upper;
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
