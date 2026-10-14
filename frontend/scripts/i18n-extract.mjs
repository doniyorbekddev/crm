// UI matnlarini manba koddan yig'adi: JSX matni, satr va shablon literallari.
// Ishlatish: node scripts/i18n-extract.mjs > /tmp/catalog.json
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Standart — frontend; `node scripts/i18n-extract.mjs ../backend/src` — server xabarlari (toast, bildirishnoma matnlari)
const ROOT = path.resolve(process.argv[2] ?? path.resolve(import.meta.dirname, '../src'));
// Veb-interfeysda ko'rinmaydigan matnlar: Telegram bot ekranlari, AI so'rov matnlari, CLI
const EXCLUDED = ['test', 'i18n', 'generated', 'cli', 'telegram', 'ai', 'jobs', 'generated'];
const files = [];
// Katalog o'rniga bitta fayl ham berish mumkin (masalan tizim ma'lumotlari: prisma/coreSeed.ts)
if (fs.statSync(ROOT).isFile()) files.push(ROOT);
else (function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!EXCLUDED.includes(entry.name)) walk(full); }
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name)) files.push(full);
    else if (entry.isDirectory() && entry.name === 'generated') continue;
  }
})(ROOT);

const exact = new Map(); // matn -> fayllar soni
const patterns = new Map(); // "{0} ta ochiq ish" -> soni
const norm = (text) => text.replace(/\s+/g, ' ').trim();
// Inson o'qiydigan matn: kamida bitta harf va (bo'sh joy YOKI bosh harf bilan boshlangan so'z YOKI o'zbekcha belgi)
// Bitta ASCII so'z: camelCase, kalit (a.b, a:b, a/b) yoki format — matn emas
const isIdentifier = (text) => !/\s/.test(text) && /^[\x21-\x7e]+$/.test(text) && (/^[a-z]+[A-Z]/.test(text) || /[./_=]|:[a-z]/.test(text) || /^[a-z]{1,2}$/.test(text));
// Kichik harfli matn: bir necha so'z bo'lsa — jumla bo'lagi ("daqiqa oldin"); bitta so'z bo'lsa — faqat funksiya qaytaradigan
// yoki shartli ifodadagi qiymat ("hozirgina"), aks holda bu odatda kalit ("asc", "button")
const lowerOnly = (text) => /^[a-z0-9_.:/#@\-[\]()%=&?+*,;|<>{}!$'"`~^\\\s]+$/.test(text);
const isHuman = (text, node) =>
  !isIdentifier(text) && /\p{L}{2}/u.test(text) && !/^[A-Z0-9_]+$/.test(text) && !/^(https?:|\/|\.\/|@\/)/.test(text) &&
  (!lowerOnly(text) || (/\p{L}{2,}\s+\p{L}{2,}/u.test(text) && !/[=<>{}\[\]|&;]/.test(text)) || (node && (ts.isReturnStatement(node.parent) || ts.isConditionalExpression(node.parent)) && /^[a-z‘’ʻ']{4,}$/.test(text)));
// Kod emas: className, yo'l, kalitlar
const isCode = (node) => {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent)) return true;
  if (ts.isJsxAttribute(parent)) return /^(className|wrapperClassName|id|htmlFor|name|type|to|href|src|key|role|variant|size|tone|data-.*|value|accept|autoComplete|inputMode|method|target|rel|d|viewBox|fill|stroke|path|lazy|mode|side|align|icon)$/.test(parent.name.getText());
  if (ts.isCallExpression(parent) && /^(cn|clsx|register|setError|watch|getValues|setValue|invalidateQueries|navigate|startsWith|endsWith|includes|get|set|has|append|test|match|replace|split|join|querySelector(All)?|addEventListener|removeEventListener|getItem|setItem|removeItem|import|lazyComponent|z\.enum)$/.test(parent.expression.getText().split('.').pop() ?? '')) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertyAssignment(parent) && /^(queryKey|path|className|to|href|key|id|type|variant|tone|size|method|url|icon|accept|sortBy|sortOrder|field|keywords)$/.test(parent.name.getText())) return true;
  if (ts.isBinaryExpression(parent) && /^(===|!==|==|!=)$/.test(parent.operatorToken.getText())) return true;
  if (ts.isCaseClause(parent) || ts.isElementAccessExpression(parent) || ts.isTypeOfExpression(parent)) return true;
  return false;
};
const add = (map, text) => map.set(text, (map.get(text) ?? 0) + 1);

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  (function visit(node) {
    if (ts.isJsxText(node)) {
      const text = norm(node.text);
      if (text && /\p{L}/u.test(text)) add(exact, text);
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isCode(node)) {
      const text = norm(node.text);
      if (text && isHuman(text, node)) add(exact, text);
    } else if (ts.isTemplateExpression(node) && !isCode(node)) {
      let out = node.head.text;
      node.templateSpans.forEach((span, index) => { out += `{${index}}${span.literal.text}`; });
      const text = norm(out);
      if (isHuman(text.replace(/\{\d+\}/g, ' ').trim(), node)) add(patterns, text);
    }
    ts.forEachChild(node, visit);
  })(source);
}
const sorted = (map) => [...map.keys()].sort((a, b) => a.localeCompare(b, 'uz'));
process.stdout.write(JSON.stringify({ exact: sorted(exact), patterns: sorted(patterns) }, null, 1));
