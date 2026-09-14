/* eslint-disable no-console -- CLI skript */
/**
 * E2E bazasini tayyorlaydi: qaytadan yaratadi, migratsiyalarni qo'llaydi va development seed'ini yuklaydi.
 *
 *   npm run test:e2e        (shu skript + playwright test)
 */
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { BACKEND_DIR, e2eDatabaseUrl } from './env';

async function recreateDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const databaseName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    // Nom e2eDatabaseUrl() da tekshirilgan (faqat [a-z0-9_])
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = e2eDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  console.log(`E2E bazasi: ${name} — qaytadan yaratilmoqda`);
  await recreateDatabase(url);

  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { cwd: BACKEND_DIR, env, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('✔ migratsiyalar');
  execSync('npx prisma db seed', { cwd: BACKEND_DIR, env, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('✔ seed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
