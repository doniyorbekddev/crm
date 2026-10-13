// Lug'at to'liqligini tekshiradi: koddagi (frontend + server xabarlari) har bir matn `source.json` da bormi va
// rus/ingliz tarjimasi mavjudmi. Yangi matn qo'shilgach: `npm run i18n:check` — yo'qlari ro'yxati chiqadi.
// `--write` — `source.json` ni yangilaydi (kirill shu ro'yxat bo'yicha ishlaydi); ru/en ga tarjimani qo'lda qo'shing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = import.meta.dirname;
const catalogDir = path.resolve(dir, '../src/i18n/catalog');
const extract = (root) => JSON.parse(execFileSync('node', [path.join(dir, 'i18n-extract.mjs'), ...(root ? [root] : [])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const weak = (text) => text.replace(/\{\d+\}|[^A-Za-z‘ʻ’']/g, '').length < 4;
// CSS klasslari va uslub qiymatlari ("bg-surface text-fg", "1px solid var(--x)") — matn emas
const cssLike = (text) => text.split(/\s+/).every((token) => /^[a-z0-9:/[\]().%#,!_-]+$/.test(token)) && /[-:(]/.test(text);
const bad = (text) => cssLike(text) || text.length > 400 || /SELECT |FROM "|<\?xml|function\s*\(|=>\s*\{/.test(text);

const frontend = extract();
const backend = extract(path.resolve(dir, '../../backend/src'));
// Tizim yaratadigan ma'lumot nomlari (lead manbalari, darajalar, nishonlar) — bazada saqlanadi, lekin matni kodda
const seeds = ['coreSeed.ts'].map((file) => extract(path.resolve(dir, '../../backend/prisma', file)));
// Koddan avtomatik chiqmaydigan (bo'laklardan yig'iladigan) matnlar: "5mln", "jami 18" — qo'lda yuritiladi
const manual = JSON.parse(fs.readFileSync(path.resolve(dir, '../src/i18n/catalog/manual.json'), 'utf8'));
const exact = [...new Set([...frontend.exact, ...backend.exact, ...manual.exact, ...seeds.flatMap((seed) => seed.exact)])].filter((text) => !bad(text)).sort((a, b) => a.localeCompare(b, 'uz'));
const patterns = [...new Set([...frontend.patterns, ...backend.patterns, ...manual.patterns, ...seeds.flatMap((seed) => seed.patterns)])].filter((text) => manual.patterns.includes(text) || (!bad(text) && !weak(text)) && (text.match(/\{\d+\}/g) ?? []).length <= 6).sort((a, b) => a.localeCompare(b, 'uz'));

const read = (name) => JSON.parse(fs.readFileSync(path.join(catalogDir, name), 'utf8'));
const source = read('source.json');
const report = { 'source.json (exact)': exact.filter((text) => !source.exact.includes(text)), 'source.json (patterns)': patterns.filter((text) => !source.patterns.includes(text)) };
let missing = report['source.json (exact)'].length + report['source.json (patterns)'].length;
for (const language of ['ru', 'en']) {
  const catalog = read(`${language}.json`);
  // Tarjimasi manba bilan bir xil matnlar (CRM, PDF, brend nomlari) lug'atda saqlanmaydi — shuning uchun faqat
  // harfli va bo'sh joyli (ya'ni haqiqiy jumla) matnlar tekshiriladi
  report[`${language}.json`] = [...exact.filter((text) => !(text in catalog.exact)), ...patterns.filter((text) => !(text in catalog.patterns))].filter((text) => /\p{L}{3}.*\s.*\p{L}{3}/u.test(text) && /[‘ʻ’]|\b(va|yoki|uchun|bilan|emas|kerak|mumkin|bo‘yicha|yo‘q|ta)\b/.test(text));
}
for (const [name, list] of Object.entries(report)) {
  console.log(`${name}: ${list.length} ta yo'q`);
  for (const text of list.slice(0, 40)) console.log(`  - ${text}`);
}
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(catalogDir, 'source.json'), JSON.stringify({ exact, patterns }, null, 0));
  console.log('source.json yangilandi');
} else if (missing > 0) {
  process.exitCode = 1;
}
