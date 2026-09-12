import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/** Ilova bo‘ylab yagona Prisma Client (connection pool bitta bo‘lishi uchun). */
export const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('warn', (event) => {
  logger.warn({ target: event.target }, `Prisma: ${event.message}`);
});

prisma.$on('error', (event) => {
  logger.error({ target: event.target }, `Prisma: ${event.message}`);
});

const DATABASE_PING_TIMEOUT_MS = 3_000;

/** Baza javob berayotganini tekshiradi (health check uchun). Hech qachon xatolik tashlamaydi. */
export async function isDatabaseReachable(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), DATABASE_PING_TIMEOUT_MS);
  });

  try {
    const ping = prisma.$queryRaw`SELECT 1`.then(() => true as const);
    return await Promise.race([ping, timeout]);
  } catch (error) {
    logger.warn({ err: error }, 'Ma’lumotlar bazasiga ulanib bo‘lmadi');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
