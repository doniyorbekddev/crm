/* eslint-disable no-console -- CLI skript: natija terminalga chiqariladi */
/**
 * Onlayn urinish natijalarini imtihon shkalasiga o'tkazish (PHASE 15 tuzatishi).
 *
 *   npm run db:backfill-exam-scale            # faqat hisobot (hech narsa yozilmaydi)
 *   npm run db:backfill-exam-scale -- --apply # yozadi (oldin pg_dump oling)
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { backfillExamResultScale } from './examResultScaleBackfill.js';

config({ quiet: true });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL topilmadi. backend/.env faylini tekshiring.');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

backfillExamResultScale(prisma, apply)
  .then(({ checked, changed }) => {
    console.log(`${checked} ta natija tekshirildi, ${changed} tasi xom ballda${apply ? ' — tuzatildi' : ' (yozish uchun --apply)'}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
