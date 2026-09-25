import { describe, expect, it } from 'vitest';
import { codeFindings, jaccard, shingles, similarPairs, tokenize } from '../../src/services/ai/similarity.js';

const BASE = 'function sum(numbers) { let total = 0; for (const value of numbers) { total += value; } return total; } console.info(sum([1, 2, 3]));';

describe('o‘xshashlik signali (TZ §36)', () => {
  it('izoh va bo‘shliq farqi o‘xshashlikni yashirmaydi', () => {
    const copy = `// mening yechimim\n${BASE.replace(/ /g, '   ')} /* oxiri */`;
    expect(jaccard(shingles(tokenize(BASE)), shingles(tokenize(copy)))).toBe(1);
  });

  it('juftliklar: yuqori o‘xshash va bir xil havola belgilanadi, turli yechim — yo‘q', () => {
    const different = 'const add = (list) => list.reduce((acc, item) => acc + item, 0); export default add; // reduce bilan qisqa yechim uchun misol';
    const pairs = similarPairs([
      { id: 'a', text: BASE },
      { id: 'b', text: `${BASE} // tayyor` },
      { id: 'c', text: different, linkUrl: 'https://github.com/x/repo/' },
      { id: 'd', text: 'qisqa', linkUrl: 'https://github.com/X/repo' },
    ]);
    expect(pairs).toEqual([
      { a: 'a', b: 'b', score: 100, sameLink: false },
      { a: 'c', b: 'd', score: 0, sameLink: true },
    ]);
  });

  it('juda qisqa javoblar solishtirilmaydi', () => {
    expect(similarPairs([{ id: 'a', text: 'bajarildi' }, { id: 'b', text: 'bajarildi' }])).toEqual([]);
  });
});

describe('kod tekshiruvi (TZ §35)', () => {
  it('xavfsizlik, uslub, accessibility va tugallanmaganlik naqshlari', () => {
    const code = `var x = eval(input);\nif (x == 1) { el.innerHTML = x; console.log(x) }\n// TODO: validatsiya\ndocument.body.append('<img src="a.png">')`;
    const areas = codeFindings(code, 'javascript').map((finding) => finding.area);
    expect(areas).toEqual(['security', 'security', 'bestPractice', 'bestPractice', 'quality', 'accessibility', 'completeness']);
  });

  it('toza kodda topilma yo‘q', () => {
    expect(codeFindings('const total = items.reduce((sum, item) => sum + item.price, 0);\nif (total === 0) return;', 'javascript')).toEqual([]);
  });
});
