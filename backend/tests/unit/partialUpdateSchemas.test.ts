import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ZodType } from 'zod';
import { createSessionSchema, updateSessionSchema } from '../../src/validators/attendanceSession.validator.js';
import { accountSchema, updateAccountSchema } from '../../src/validators/finance.validator.js';
import {
  createExamSchema,
  createHomeworkSchema,
  updateExamSchema,
  updateHomeworkSchema,
} from '../../src/validators/homework.validator.js';
import { recurringExpenseSchema, updateRecurringExpenseSchema } from '../../src/validators/incomeExpense.validator.js';

const VALIDATORS_DIR = path.resolve(import.meta.dirname, '../../src/validators');

/**
 * To'liq almashtiriladigan yozuvlar: forma har doim barcha maydonlarni yuboradi, servis esa
 * yuborilmagan ixtiyoriy maydonlarni ham tozalaydi — standart qiymat bu yerda kutilgan xatti-harakat.
 */
const FULL_REPLACE_SCHEMAS = new Set(['updateCallSchema']);

describe('Qisman tahrirlash sxemalari standart qiymat qo‘ymaydi', () => {
  it('yuborilmagan maydon natijada bo‘lmaydi (maksimal ball, XP, holat, usul, tartib o‘zgarmaydi)', () => {
    expect(updateExamSchema.parse({ title: 'Nazorat ishi' })).toEqual({ title: 'Nazorat ishi' });
    expect(updateHomeworkSchema.parse({ title: 'Uy ishi' })).toEqual({ title: 'Uy ishi' });
    expect(updateSessionSchema.parse({ topic: 'Massivlar' })).toEqual({ topic: 'Massivlar' });
    expect(updateAccountSchema.parse({ name: 'Asosiy kassa' })).toEqual({ name: 'Asosiy kassa' });
    expect(updateRecurringExpenseSchema.parse({ name: 'Ijara' })).toEqual({ name: 'Ijara' });
  });

  it('yaratishda standart qiymatlar saqlanadi', () => {
    expect(createExamSchema.parse({ title: 'Oraliq', groupId: 'g1', date: '2026-09-20' })).toMatchObject({
      maxScore: 100,
      xpReward: 50,
      status: 'PLANNED',
    });
    expect(createHomeworkSchema.parse({ title: 'Uy ishi', groupId: 'g1', deadline: '2026-09-20T18:00:00.000Z' })).toMatchObject({
      maxPoints: 100,
      xpReward: 20,
      status: 'PUBLISHED',
    });
    expect(createSessionSchema.parse({ groupId: 'g1', date: '2026-09-20' })).toMatchObject({ status: 'HELD' });
    expect(accountSchema.parse({ key: 'MAIN', name: 'Kassa', type: 'CASH' })).toMatchObject({ sortOrder: 0 });
    expect(
      recurringExpenseSchema.parse({ name: 'Ijara', categoryId: 'c1', amount: 1_000_000, dayOfMonth: 5, startDate: '2026-09-01' }),
    ).toMatchObject({ method: 'CASH' });
  });

  it('barcha validatorlar: bo‘sh `update*Schema` hech qanday qiymat qo‘shmaydi', async () => {
    const files = readdirSync(VALIDATORS_DIR).filter((file) => file.endsWith('.validator.ts'));
    const checked: string[] = [];
    const offenders: string[] = [];
    for (const file of files) {
      const module = (await import(pathToFileURL(path.join(VALIDATORS_DIR, file)).href)) as Record<string, unknown>;
      for (const [name, schema] of Object.entries(module)) {
        if (!/^update.*Schema$/.test(name) || !(schema instanceof ZodType) || FULL_REPLACE_SCHEMAS.has(name)) continue;
        const result = schema.safeParse({});
        // "Kamida bitta maydon" talabi bo'lgan sxemalar bo'sh obyektni rad etadi — bu ham to'g'ri
        if (!result.success) continue;
        checked.push(name);
        const data = result.data as Record<string, unknown>;
        const injected = Object.keys(data).filter((key) => data[key] !== undefined);
        if (injected.length > 0) offenders.push(`${file} → ${name}: ${injected.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(checked.length).toBeGreaterThan(3);
  });
});
