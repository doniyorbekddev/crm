/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Ruxsatlarni bazaga moslash (production deploy uchun).
 *
 * Muammo: `prisma migrate deploy` faqat jadval tuzilmasini yangilaydi. Ruxsatlar esa
 * ma'lumot — ular `permissions` jadvalida yozuv sifatida yashaydi. Yangi modul qo'shilganda
 * (masalan ombor yoki chegirma) uning ruxsati bazada bo'lmasa, `requirePermission` hammani
 * rad etadi: sahifa hech kimda, hatto Super Adminda ham ochilmaydi.
 *
 * Shu skript **ruxsatlar, tizim rollari va lead manbalarini** moslaydi:
 *   - yangi ruxsatlar yaratiladi, mavjudlarining izohi yangilanadi;
 *   - **shu yurishda yangi paydo bo'lgan** ruxsatlar tizim rollariga qo'shiladi;
 *   - Super Admin tomonidan qo'lda o'zgartirilgan rol ruxsatlari **tegilmaydi**
 *     (`SEED_RESET_PERMISSIONS=true` bo'lmasa);
 *   - yo'q lead manbalari yaratiladi (mavjudlari tegilmaydi).
 *
 * Demo ma'lumot yaratmaydi, admin hisobi ochmaydi — shuning uchun har deployda xavfsiz ishlaydi.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedLeadSources, seedRolesAndPermissions } from './coreSeed.js';

config({ quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✖ DATABASE_URL topilmadi');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main(): Promise<void> {
  const before = await prisma.permission.count();
  await seedRolesAndPermissions(prisma, (message: string) => console.log(`  ${message}`));
  const after = await prisma.permission.count();
  console.log(`✔ Ruxsatlar moslandi: ${before} → ${after}`);

  // Lead manbalari ham shu yerda ta'minlanadi. Ular ruxsat emas, lekin xuddi shunday "busiz ishlamaydigan"
  // ma'lumot: ilovada manba qo'shadigan sahifa yo'q, lid formasi esa manbani majburiy so'raydi. Birlamchi
  // sozlash (`db:bootstrap`) yurmagan bazada (admin qo'lda yaratilgan) ro'yxat bo'sh qolib, lid qo'shib
  // bo'lmasdi. Faqat YO'Q manbalar yaratiladi — mavjudlarining nomi, tartibi va faolligi o'zgarmaydi.
  const sourcesBefore = await prisma.source.count();
  await seedLeadSources(prisma, () => undefined);
  const sourcesAfter = await prisma.source.count();
  console.log(`✔ Lead manbalari: ${sourcesBefore} → ${sourcesAfter}`);
}

main()
  .catch((error: unknown) => {
    console.error('✖ Ruxsatlarni moslashda xatolik:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
