import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { directionOf } from '../src/services/inventory.service.js';
import { bearer, createUserWithToken } from './helpers/auth.js';
import { hasTestDatabase, resetDatabase, seedRolesAndPermissions } from './helpers/db.js';

const app = createApp();

async function createCategory(key = 'books', name = 'Kitoblar') {
  return prisma.productCategory.create({ data: { key, name, sortOrder: 10 } });
}

async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const category = (overrides.categoryId as string) ?? (await createCategory()).id;
  const response = await request(app)
    .put('/api/products')
    .set(bearer(token))
    .send({ sku: 'KITOB-01', name: 'Ingliz tili darsligi', categoryId: category, price: 80_000, cost: 50_000, minQuantity: 5, ...overrides });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; quantity: number };
}

describe('Ombor harakati yo‘nalishi', () => {
  it('kirim musbat, chiqim manfiy', () => {
    expect(directionOf('PURCHASE', 10)).toBe(10);
    expect(directionOf('RETURN', 3)).toBe(3);
    expect(directionOf('SALE', 4)).toBe(-4);
    expect(directionOf('DAMAGE', 2)).toBe(-2);
    expect(directionOf('TRANSFER_OUT', 5)).toBe(-5);
  });
});

describe.skipIf(!hasTestDatabase)('Inventar (ombor)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('kirim qoldiqni oshiradi va tannarxni yangilaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(token);

    const movement = await request(app)
      .post('/api/products/movements')
      .set(bearer(token))
      .send({ productId: product.id, type: 'PURCHASE', quantity: 20, unitPrice: 55_000, reason: 'Yangi partiya' });

    expect(movement.status).toBe(201);
    expect(movement.body.data.balanceAfter).toBe(20);
    expect(movement.body.data.totalAmount).toBe(1_100_000);

    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stored.quantity).toBe(20);
    // Xaridda tannarx oxirgi narxga yangilanadi
    expect(stored.cost.toNumber()).toBe(55_000);
  });

  it('qoldiq yetmasa chiqim rad etiladi va minusga tushmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(token);
    await request(app).post('/api/products/movements').set(bearer(token)).send({ productId: product.id, type: 'PURCHASE', quantity: 3 }).expect(201);

    const tooMany = await request(app)
      .post('/api/products/movements')
      .set(bearer(token))
      .send({ productId: product.id, type: 'SALE', quantity: 5 });

    expect(tooMany.status).toBe(422);
    expect(tooMany.body.message).toContain('yetarli emas');
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stored.quantity).toBe(3);
  });

  it('sotuv pul yozuvini ham yaratadi va bitta tranzaksiya bo‘ladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(token);
    await request(app).post('/api/products/movements').set(bearer(token)).send({ productId: product.id, type: 'PURCHASE', quantity: 10 }).expect(201);
    const category = await prisma.incomeCategory.create({ data: { key: 'goods', name: 'Mahsulot sotuvi', sortOrder: 10 } });

    const sale = await request(app)
      .post('/api/products/movements')
      .set(bearer(token))
      .send({ productId: product.id, type: 'SALE', quantity: 2, money: { categoryId: category.id, method: 'CASH' } });

    expect(sale.status).toBe(201);
    expect(sale.body.data.hasMoneyRecord).toBe(true);
    expect(sale.body.data.totalAmount).toBe(160_000);

    const incomes = await prisma.income.findMany({ select: { amount: true, transactionId: true } });
    expect(incomes).toHaveLength(1);
    expect(incomes[0]!.amount.toNumber()).toBe(160_000);
    // Pul harakati aynan bitta daftar yozuvi
    const transactions = await prisma.transaction.findMany({ where: { type: 'INCOME' } });
    expect(transactions).toHaveLength(1);
  });

  it('pul yozuvisiz sotuv faqat qoldiqni o‘zgartiradi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(token);
    await request(app).post('/api/products/movements').set(bearer(token)).send({ productId: product.id, type: 'PURCHASE', quantity: 5 }).expect(201);

    const sale = await request(app).post('/api/products/movements').set(bearer(token)).send({ productId: product.id, type: 'SALE', quantity: 1 });

    expect(sale.body.data.hasMoneyRecord).toBe(false);
    expect(await prisma.income.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('kam qoldiq belgilanadi va statistikada ko‘rinadi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(token, { minQuantity: 5 });
    await request(app).post('/api/products/movements').set(bearer(token)).send({ productId: product.id, type: 'PURCHASE', quantity: 4 }).expect(201);

    const list = await request(app).get('/api/products').set(bearer(token));
    expect(list.body.data[0].isLowStock).toBe(true);
    expect(list.body.data[0].stockValue).toBe(200_000);

    const stats = await request(app).get('/api/products/stats').set(bearer(token));
    expect(stats.body.data.lowStock).toBe(1);
    expect(stats.body.data.outOfStock).toBe(0);
    expect(stats.body.data.stockValue).toBe(200_000);
  });

  it('bitta filialda kod takrorlanmaydi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const category = await createCategory();
    await createProduct(token, { categoryId: category.id });

    const duplicate = await request(app)
      .put('/api/products')
      .set(bearer(token))
      .send({ sku: 'KITOB-01', name: 'Boshqa kitob', categoryId: category.id });

    expect(duplicate.status).toBe(409);
  });

  it('hisobdan chiqarish sabab bilan tarixda qoladi', async () => {
    const { token } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(token);
    await request(app).post('/api/products/movements').set(bearer(token)).send({ productId: product.id, type: 'PURCHASE', quantity: 10 }).expect(201);
    await request(app)
      .post('/api/products/movements')
      .set(bearer(token))
      .send({ productId: product.id, type: 'DAMAGE', quantity: 2, reason: 'Suv to‘kilgan' })
      .expect(201);

    const movements = await request(app).get('/api/products/movements').query({ productId: product.id }).set(bearer(token));
    expect(movements.body.data).toHaveLength(2);
    expect(movements.body.data[0]).toMatchObject({ type: 'DAMAGE', quantity: 2, balanceAfter: 8, reason: 'Suv to‘kilgan' });
  });

  it('ombor huquqi yo‘q xodim harakat yoza olmaydi', async () => {
    const { token: adminToken } = await createUserWithToken(app, { role: 'SUPER_ADMIN' });
    const product = await createProduct(adminToken);
    const { token } = await createUserWithToken(app, { role: 'TEACHER', email: 'ustoz-ombor@local.uz' });

    await request(app).get('/api/products').set(bearer(token)).expect(403);
    await request(app)
      .post('/api/products/movements')
      .set(bearer(token))
      .send({ productId: product.id, type: 'SALE', quantity: 1 })
      .expect(403);
  });
});
