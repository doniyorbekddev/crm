/* eslint-disable no-console -- CLI: natija terminalga chiqariladi */
/**
 * Mavjud o'quvchilarni oylik to'lov modeliga o'tkazish (2026-11). Standart holatda faqat rejani ko'rsatadi;
 * `--apply` bo'lmasa hech narsa yozilmaydi. Amal SUPER_ADMIN nomidan auditga yoziladi.
 *   Production: node dist/cli/monthlyFeeMigration.js [--apply] [--details]
 *   Dev:        npm run billing:monthly-fee -- [--apply] [--details]
 */
import { prisma } from '../config/database.js';
import { migrateToMonthlyFee } from '../services/monthlyFeeMigration.service.js';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => !['--apply', '--details'].includes(arg));
if (unknown.length > 0) {
  console.error('Ishlatish: monthlyFeeMigration [--apply] [--details]');
  process.exit(1);
}
const apply = args.includes('--apply');
const details = args.includes('--details');
const money = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

try {
  const actor = await prisma.user.findFirst({ where: { status: 'ACTIVE', role: { key: 'SUPER_ADMIN' } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const rows = await migrateToMonthlyFee({ apply, actorId: actor?.id ?? null });
  const changed = rows.filter((row) => row.changed);
  const sum = (pick: (row: (typeof rows)[number]) => number) => changed.reduce((total, row) => total + pick(row), 0);
  console.log(apply ? 'BAJARILDI — oylik to‘lov modeliga o‘tkazildi' : 'REJA (hech narsa o‘zgarmadi) — bajarish uchun: --apply');
  console.log(`  o‘quvchilar: ${rows.length}, o‘zgaradigan: ${changed.length}`);
  console.log(`  shartnoma jami: ${money(sum((row) => row.plan.totalBefore))} → ${money(sum((row) => row.plan.totalAfter))}`);
  console.log(`  bekor qilinadigan (oktyabrdan oldingi) oylar: ${sum((row) => row.plan.cancel.length)}, summasi o‘zgaradigan oylar: ${sum((row) => row.plan.reprice.length)}`);
  console.log(`  muzlatilgan o‘quvchilar: ${changed.filter((row) => row.plan.freeze.length > 0).length}, yozilmaydigan oylar: ${sum((row) => row.plan.freeze.length)}`);
  console.log(`  tegilmagan oylar (bir oyda bir nechta qism / yopilgan oy): ${sum((row) => row.plan.untouched.length)}`);
  console.log(`  yangi oy taqsimotlari: ${sum((row) => row.plan.allocations.length)}, oylarga sig'magan to‘lov: ${money(sum((row) => row.plan.unallocated))}`);
  if (details) {
    for (const row of changed) {
      const { plan } = row;
      const months = plan.charges.map((item) => item.key.slice(2)).join(',');
      const extra = [
        plan.cancel.length ? `bekor: ${plan.cancel.map((item) => item.key).join(',')}` : '',
        plan.freeze.length ? `muzlatilgan: ${plan.freeze.map((item) => item.key).join(',')}` : '',
        plan.untouched.length ? `tegilmadi: ${plan.untouched.join(',')}` : '',
        plan.unallocated ? `sig'madi: ${money(plan.unallocated)}` : '',
      ].filter(Boolean);
      console.log(`  ${row.name} | oylik ${money(row.monthly)} | ${plan.charges.length} oy (${months}) | jami ${money(plan.totalBefore)} → ${money(plan.totalAfter)} | to‘langan ${money(row.paid)}${extra.length ? ` | ${extra.join(' | ')}` : ''}`);
    }
  }
  process.exitCode = 0;
} catch (error) {
  console.error('Xatolik:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
