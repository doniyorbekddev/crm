import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { sanitizeFileName } from '../src/utils/fileStorage.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';
import { binaryParser } from './helpers/zip.js';

const app = createApp();

/** 1×1 PNG */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function seedReference() {
  await prisma.financialAccount.create({ data: { key: 'CASH', name: 'Naqd kassa', type: 'CASH', balance: 10_000_000, sortOrder: 1 } });
  await prisma.expenseCategory.create({ data: { key: 'RENT', name: 'Ijara', sortOrder: 1 } });
  await prisma.incomeCategory.create({ data: { key: 'BOOKS', name: 'Kitoblar', sortOrder: 1 } });
}

function upload(token: string, url: string, body: Buffer, name: string, contentType = 'application/octet-stream') {
  return request(app).post(url).set(bearer(token)).set('Content-Type', contentType).set('X-File-Name', encodeURIComponent(name)).send(body);
}

describe('fayl nomini tozalash', () => {
  it('papka qismi va xavfli belgilar olib tashlanadi, kengaytma haqiqiy turga moslanadi', () => {
    expect(sanitizeFileName('../../etc/passwd', 'pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('C:\\Users\\chek <1>.exe', 'png')).toBe('chek 1.png');
    expect(sanitizeFileName(encodeURIComponent('Ijara cheki — sentabr.jpg'), 'jpg')).toBe('Ijara cheki — sentabr.jpg');
    expect(sanitizeFileName(undefined, 'webp')).toBe('fayl.webp');
  });
});

describe.skipIf(!hasTestDatabase)('Xarajat va tushum cheklari (integratsion)', () => {
  let accountant: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    await seedReference();
    ({ token: accountant } = await createUserWithToken(app, { role: 'ACCOUNTANT', email: 'accountant@test.uz' }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('chek yuklanadi, ruxsat bilan yuklab olinadi; soxta tur, dublikat va katta fayl rad etiladi', async () => {
    const rent = await prisma.expenseCategory.findFirstOrThrow();
    const expense = await request(app).post('/api/expenses').set(bearer(accountant)).send({ categoryId: rent.id, amount: 500_000, method: 'CASH' });
    const url = `/api/expenses/${expense.body.data.id}/attachments`;

    const uploaded = await upload(accountant, url, PNG, 'ijara cheki.png', 'image/png');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data).toMatchObject({ originalName: 'ijara cheki.png', mimeType: 'image/png', size: PNG.length });
    const documentId = uploaded.body.data.id as string;

    const list = await request(app).get(url).set(bearer(accountant));
    expect(list.body.data).toHaveLength(1);
    const entries = await request(app).get('/api/expenses').set(bearer(accountant));
    expect(entries.body.data[0].attachments).toBe(1);

    const downloaded = await request(app).get(`/api/documents/${documentId}/download`).set(bearer(accountant)).buffer(true).parse(binaryParser);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toContain('image/png');
    expect(downloaded.headers['content-disposition']).toContain("filename*=UTF-8''ijara%20cheki.png");
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff');
    expect((downloaded.body as Buffer).equals(PNG)).toBe(true);

    // Kengaytma va Content-Type soxta — haqiqiy tur magic bytes bo'yicha
    expect((await upload(accountant, url, Buffer.from('<script>alert(1)</script>'), 'chek.png', 'image/png')).status).toBe(422);
    expect((await upload(accountant, url, PNG, 'yana.png', 'image/png')).status).toBe(409);
    expect((await upload(accountant, url, Buffer.alloc(6 * 1024 * 1024, 1), 'katta.pdf', 'application/pdf')).status).toBe(413);

    const { token: sales } = await createUserWithToken(app, { role: 'SALES_MANAGER', email: 'sales@test.uz' });
    expect((await request(app).get(`/api/documents/${documentId}/download`).set(bearer(sales))).status).toBe(403);
    expect((await request(app).delete(`/api/documents/${documentId}`).set(bearer(sales))).status).toBe(403);
    expect((await request(app).get(`/api/documents/${documentId}/download`)).status).toBe(401);

    expect((await request(app).delete(`/api/documents/${documentId}`).set(bearer(accountant))).status).toBe(200);
    expect((await request(app).get(url).set(bearer(accountant))).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/documents/${documentId}/download`).set(bearer(accountant))).status).toBe(404);
    // Yumshoq o'chirish: yozuv tarixda qoladi
    expect(await prisma.document.count({ where: { id: documentId, deletedAt: { not: null } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ['document.uploaded', 'document.deleted'] } } })).toBe(2);
  });

  it('tushumga PDF biriktiriladi; o‘qituvchi ko‘ra olmaydi, noma’lum yozuv 404', async () => {
    const books = await prisma.incomeCategory.findFirstOrThrow();
    const income = await request(app).post('/api/incomes').set(bearer(accountant)).send({ categoryId: books.id, amount: 200_000, method: 'CASH' });
    const url = `/api/incomes/${income.body.data.id}/attachments`;

    const uploaded = await upload(accountant, url, PDF, 'shartnoma.pdf');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.mimeType).toBe('application/pdf');

    const { token: teacher } = await createUserWithToken(app, { role: 'TEACHER', email: 'teacher@test.uz' });
    expect((await request(app).get(url).set(bearer(teacher))).status).toBe(403);
    expect((await request(app).get(`/api/documents/${uploaded.body.data.id}/download`).set(bearer(teacher))).status).toBe(403);
    expect((await request(app).get('/api/incomes/yoq/attachments').set(bearer(accountant))).status).toBe(404);
  });
});
