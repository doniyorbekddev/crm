/**
 * O'zbek lotin → kirill o'girish (1995-yilgi lotin alifbosi → 1940-yilgi kirill alifbosi).
 *
 * Faqat interfeys matnlari uchun: chaqiruvchi (`translator.ts`) buni faqat lug'atda bor matnlarga qo'llaydi —
 * foydalanuvchi ma'lumotlari (ism, email, guruh nomi) o'girilmaydi.
 *
 * So'z darajasidagi istisnolar:
 *  - BOSH HARFLI qisqartmalar (CRM, SMS, PDF, XP) va raqamli belgilar (ST-000045) o'zgarmaydi;
 *  - o'zbek lotin alifbosida yo'q harfli so'zlar (`w`, yolg'iz `c`: Excel, JavaScript, Click) o'zgarmaydi;
 *  - `{0}` kabi o'rin belgilari o'zgarmaydi.
 */
const APOSTROPHES = /[‘’ʻʼ`']/g;

const DIGRAPHS: ReadonlyArray<[string, string]> = [
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['yo', 'ё'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['ye', 'е'],
];

const LETTERS: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н',
  o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з',
};

const VOWELS = 'aeiouAEIOU';

function matchCase(source: string, target: string, nextIsLower: boolean): string {
  if (source[0] !== source[0]!.toUpperCase() || source[0] === source[0]!.toLowerCase()) return target;
  // "Sh" → "Ш", "SH" → "Ш"; "Yo" → "Ё". Bir harfga aylangani uchun registr bitta
  if (target.length === 1) return target.toUpperCase();
  return nextIsLower || source.length === 1 ? target[0]!.toUpperCase() + target.slice(1) : target.toUpperCase();
}

function transliterateWord(word: string): string {
  // Apostrof variantlari bitta belgiga keltiriladi: o‘ / g‘ / tutuq belgisi
  const text = word.replace(APOSTROPHES, '‘');
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    const lower = char.toLowerCase();
    const next = text[index + 1];
    const pair = (lower + (next ?? '').toLowerCase());
    const after = text[index + 2];
    const afterIsLower = after !== undefined && after === after.toLowerCase() && after !== after.toUpperCase();

    // o‘ → ў, g‘ → ғ
    if ((lower === 'o' || lower === 'g') && next === '‘') {
      out += matchCase(char, lower === 'o' ? 'ў' : 'ғ', true);
      index += 2;
      continue;
    }
    const digraph = DIGRAPHS.find(([latin]) => latin === pair);
    if (digraph) {
      // "ye" faqat so'z boshida yoki unlidan keyin "е"; aks holda (masalan "y" + "e" bo'g'in chegarasida) ham "е" yoziladi
      out += matchCase(text.slice(index, index + 2), digraph[1], afterIsLower || after === undefined);
      index += 2;
      continue;
    }
    if (lower === 'e') {
      // So'z boshida va unlidan keyin "э", undoshdan keyin "е"
      const previous = text[index - 1];
      const atStart = index === 0 || previous === undefined || !/\p{L}/u.test(previous);
      out += matchCase(char, atStart || (previous !== undefined && VOWELS.includes(previous)) ? 'э' : 'е', true);
      index += 1;
      continue;
    }
    if (char === '‘') {
      // Tutuq belgisi (a’lo, ma’lumot) → ъ; so'z chetida — oddiy apostrof
      const previous = text[index - 1];
      out += previous !== undefined && /\p{L}/u.test(previous) && next !== undefined && /\p{L}/u.test(next) ? 'ъ' : '’';
      index += 1;
      continue;
    }
    const mapped = LETTERS[lower];
    out += mapped ? matchCase(char, mapped, true) : char;
    index += 1;
  }
  return out;
}

/** So'z o'girilmasligi kerakmi: qisqartma, raqamli belgi yoki o'zbek lotinida yo'q harfli (xorijiy) so'z */
function keepAsIs(word: string): boolean {
  if (/\d/.test(word)) return true;
  const letters = word.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  if (/w/i.test(word)) return true;
  // `c` faqat "ch" ichida keladi
  if (/c(?!h)/i.test(word)) return true;
  return false;
}

export function toCyrillic(text: string): string {
  // O'rin belgilari ({0}) va so'z bo'lmagan qismlar o'z holicha; so'z — harflar va ichidagi apostroflar ketma-ketligi
  return text.replace(/\{\d+\}|[A-Za-z][A-Za-z‘’ʻʼ`']*(?:-[A-Za-z0-9‘’ʻʼ`']+)*/g, (token) => {
    if (token.startsWith('{')) return token;
    return token
      .split('-')
      .map((part) => (keepAsIs(part) ? part : transliterateWord(part)))
      .join('-');
  });
}
