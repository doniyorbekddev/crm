/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Ruxsatlarni bazaga moslash (production deploy uchun).
 *
 * Muammo: `prisma migrate deploy` faqat jadval tuzilmasini yangilaydi. Ruxsatlar esa
 * ma'lumot — ular `permissions` jadvalida yozuv sifatida yashaydi. Yangi modul qo'shilganda
 * (masalan ombor yoki chegirma) uning ruxsati bazada bo'lmasa, `requirePermission` hammani
 * rad etadi: sahifa hech kimda, hatto Super Adminda ham ochilmaydi.
 *
 * Shu skript **faqat ruxsat va tizim rollarini** moslaydi:
 *   - yangi ruxsatlar yaratiladi, mavjudlarining izohi yangilanadi;
 *   - **shu yurishda yangi paydo bo'lgan** ruxsatlar tizim rollariga qo'shiladi;
 *   - Super Admin tomonidan qo'lda o'zgartirilgan rol ruxsatlari **tegilmaydi**
 *     (`SEED_RESET_PERMISSIONS=true` bo'lmasa).
 *
 * Demo ma'lumot yaratmaydi, admin hisobi ochmaydi — shuning uchun har deployda xavfsiz ishlaydi.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedRolesAndPermissions } from './coreSeed.js';

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
}

main()
  .catch((error: unknown) => {
    console.error('✖ Ruxsatlarni moslashda xatolik:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
