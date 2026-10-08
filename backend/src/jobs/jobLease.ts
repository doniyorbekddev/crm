import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Fon vazifasi ijarasi — bir vaqtda faqat **bitta jarayon** bitta vazifani bajaradi.
 *
 * Nega kerak: har vazifadagi `running` bayrog'i faqat shu jarayon ichida ishlaydi. Ikki backend nusxasi
 * (yangi versiyani chiqarishda eski va yangi konteyner birga turgan payt yoki ataylab ikki nusxa) bir xil
 * vazifani parallel bajarsa — ikki karra hisob, ikki karra yozuv, ba'zi joyda ikki karra xabar.
 *
 * Nega `pg_advisory_lock` emas: sessiya qulfi bitta ulanishga bog'liq, Prisma esa ulanishlar pulidan har
 * so'rovga boshqasini beradi. Qulfni ushlab turish uchun vazifa davomida tranzaksiya ochiq turishi kerak
 * bo'lardi — har vazifa puldan bitta ulanishni band qiladi, bir necha vazifa birga boshlanganda pul tugaydi.
 * Jadvaldagi ijara ulanishni band qilmaydi.
 *
 * Ishlashi: `job_leases` da vazifa nomi bo'yicha bitta qator. Olish — bitta atomar `INSERT … ON CONFLICT`:
 * qator yo'q yoki muddati o'tgan bo'lsagina egasi almashadi. Egasi ishlayotganda muddatni uzaytirib turadi;
 * jarayon qulasa uzaytirish to'xtaydi va muddat (LEASE_MS) tugagach boshqa nusxa oladi.
 */
const LEASE_MS = 5 * 60_000;
const RENEW_MS = 60_000;

/** Shu jarayonning belgisi (jurnal va qo'lda tekshirish uchun) */
const OWNER = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`.slice(0, 80);

// Vaqt har doim parametr sifatida uzatiladi, SQL `NOW()` ishlatilmaydi: Prisma `DateTime` ustuni vaqt zonasiz
// (UTC) saqlanadi, `NOW()` esa vaqt zonali — taqqoslashda sessiya vaqt zonasi aralashib, ijara doim
// "muddati o'tgan" bo'lib ko'rinardi.
async function acquire(name: string): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + LEASE_MS);
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    INSERT INTO "job_leases" ("name", "owner", "lockedUntil", "startedAt")
    VALUES (${name}, ${OWNER}, ${until}, ${now})
    ON CONFLICT ("name") DO UPDATE
      SET "owner" = EXCLUDED."owner", "lockedUntil" = EXCLUDED."lockedUntil", "startedAt" = EXCLUDED."startedAt"
      WHERE "job_leases"."lockedUntil" < ${now}
    RETURNING "name"
  `;
  return rows.length > 0;
}

async function renew(name: string): Promise<void> {
  const until = new Date(Date.now() + LEASE_MS);
  await prisma.$executeRaw`UPDATE "job_leases" SET "lockedUntil" = ${until} WHERE "name" = ${name} AND "owner" = ${OWNER}`;
}

async function release(name: string): Promise<void> {
  // Muddat o'tmishga suriladi (qator qoladi): keyingi yurish darhol olishi mumkin
  const past = new Date(Date.now() - 1_000);
  await prisma.$executeRaw`UPDATE "job_leases" SET "lockedUntil" = ${past} WHERE "name" = ${name} AND "owner" = ${OWNER}`;
}

/**
 * Vazifani ijara ostida bajaradi. Ijara boshqa jarayonda bo'lsa — hech narsa qilmaydi va `false` qaytaradi.
 * Vazifa xatosi chaqiruvchiga o'tadi (ijara baribir bo'shatiladi).
 */
export async function withJobLease(name: string, task: () => Promise<void>): Promise<boolean> {
  if (!(await acquire(name))) return false;

  const timer = setInterval(() => {
    renew(name).catch((error: unknown) => logger.warn({ err: error, job: name }, 'Fon vazifasi ijarasini uzaytirib bo‘lmadi'));
  }, RENEW_MS);
  timer.unref();

  try {
    await task();
    return true;
  } finally {
    clearInterval(timer);
    await release(name).catch((error: unknown) => logger.warn({ err: error, job: name }, 'Fon vazifasi ijarasini bo‘shatib bo‘lmadi'));
  }
}
