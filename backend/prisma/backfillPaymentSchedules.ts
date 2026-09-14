/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Mavjud o‘quvchilarga to‘lov jadvali (to‘lov jadvali qo‘shilishidan oldin yaratilganlar uchun).
 *
 *   npm run db:backfill-schedules
 *
 * Faqat jadvali yo‘q o‘quvchilarga yoziladi — takror ishga tushirish xavfsiz, hech narsa o‘chirilmaydi.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { backfillPaymentSchedules } from './paymentScheduleBackfill.js';

config({ quiet: true });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL topilmadi. backend/.env faylini tekshiring.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

backfillPaymentSchedules(prisma)
  .then((count) => {
    console.log(`✔ ${count} ta o‘quvchiga to‘lov jadvali tuzildi`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
