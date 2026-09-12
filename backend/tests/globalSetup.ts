import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Testlardan oldin bir marta: test bazasiga migratsiyalarni qo‘llaydi. */
export default function setup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

  if (!testDatabaseUrl) {
    process.stdout.write('\n⚠ TEST_DATABASE_URL o‘rnatilmagan — integratsion testlar o‘tkazib yuboriladi.\n\n');
    return;
  }

  // Testlar bazani tozalaydi — development bazasi bilan adashtirilmasligi kerak
  if (testDatabaseUrl === process.env.DATABASE_URL?.trim()) {
    throw new Error('TEST_DATABASE_URL development bazasi (DATABASE_URL) bilan bir xil bo‘lmasligi kerak.');
  }

  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
}
