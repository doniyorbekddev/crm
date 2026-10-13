import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LEAD_SOURCES } from '../prisma/coreSeed.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

/**
 * Deploy'dagi moslash skripti (`db:sync-permissions`) lead manbalarini ham ta'minlaydi.
 * Sabab: birlamchi sozlash yurmagan production bazasida manbalar bo'sh edi — lid formasida tanlaydigan
 * narsa yo'q, lid qo'shib bo'lmasdi.
 */
const app = createApp();
const backendDir = fileURLToPath(new URL('..', import.meta.url));

function runSync(): string {
  return execFileSync('npx', ['tsx', 'prisma/syncPermissions.ts'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    encoding: 'utf8',
  });
}

describe.skipIf(!hasTestDatabase)('Deploy moslash skripti: lead manbalari', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bo‘sh bazada manbalar yaratiladi va lid formasi ularni ko‘rsatadi — lid qo‘shiladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'ADMIN' });
    const before = await request(app).get('/api/lookups/lead-form').set(bearer(token));
    expect(before.body.data.sources).toHaveLength(0);

    const output = runSync();
    expect(output).toContain(`Lead manbalari: 0 → ${LEAD_SOURCES.length}`);

    const after = await request(app).get('/api/lookups/lead-form').set(bearer(token));
    expect(after.body.data.sources.map((source: { name: string }) => source.name)).toEqual(LEAD_SOURCES.map((source) => source.name));

    const created = await request(app).post('/api/leads').set(bearer(token)).send({ firstName: 'Yangi', phone: '+998901234567', sourceId: after.body.data.sources[0].id });
    expect(created.status).toBe(201);
  }, 60_000);

  it('qayta yurganda mavjud manbalar o‘zgarmaydi: o‘zgartirilgan nom va o‘chirilgan holat saqlanadi, yo‘qlari qo‘shiladi', async () => {
    runSync();
    await prisma.source.update({ where: { key: 'INSTAGRAM' }, data: { name: 'Insta (reklama)', isActive: false, sortOrder: 99 } });
    await prisma.source.delete({ where: { key: 'OTHER' } });
    const custom = await prisma.source.create({ data: { key: 'TIKTOK', name: 'TikTok' } });

    const output = runSync();
    expect(output).toContain(`Lead manbalari: ${LEAD_SOURCES.length} → ${LEAD_SOURCES.length + 1}`);

    expect(await prisma.source.findUniqueOrThrow({ where: { key: 'INSTAGRAM' } })).toMatchObject({ name: 'Insta (reklama)', isActive: false, sortOrder: 99 });
    expect(await prisma.source.count({ where: { key: 'OTHER' } })).toBe(1);
    expect(await prisma.source.count({ where: { id: custom.id } })).toBe(1);
  }, 60_000);
});
