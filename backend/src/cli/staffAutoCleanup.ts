/* eslint-disable no-console -- CLI: natija terminalga chiqariladi */
/**
 * Tasdiqlanmagan avtomatik "keldi"larni bekor qilish (2026-11-10 tuzatishi). Faqat sonlar chiqariladi — ism yo'q.
 * Standart holatda faqat sanaydi; `--apply` bo'lmasa hech narsa yozilmaydi.
 *   Production: node dist/cli/staffAutoCleanup.js [--apply] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 *   Dev:        npm run staff:auto-cleanup -- [--apply] ...
 */
import { prisma } from '../config/database.js';
import { cleanupAutoCheckIns } from '../services/staffAttendance/autoCleanup.js';

const args = process.argv.slice(2);
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const known = /^--(apply|from=.*|to=.*)$/;
const unknown = args.filter((arg) => !known.test(arg));
const from = option('from');
const to = option('to');
if (unknown.length > 0 || (from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
  console.error('Ishlatish: staffAutoCleanup [--apply] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]');
  process.exit(1);
}

const apply = args.includes('--apply');
try {
  const summary = await cleanupAutoCheckIns({ apply, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  console.log(apply ? 'BAJARILDI — tasdiqlanmagan avtomatik "keldi"lar bekor qilindi' : 'SANASH (hech narsa o‘zgarmadi) — bajarish uchun: --apply');
  console.log(`  faqat avtomatik hodisali kunlar: ${summary.autoOnlyDays} (xodimlar: ${summary.autoOnlyUsers}), hodisalar: ${summary.voidedEvents}`);
  for (const [date, count] of Object.entries(summary.byDate)) console.log(`    ${date}: ${count}`);
  console.log(`  avtomatik "keldi" + QR/tuzatish bor kunlar (tegilmaydi, rahbar ko‘radi): ${summary.mixedDays}`);
  process.exitCode = 0;
} catch (error) {
  console.error('Xatolik:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
