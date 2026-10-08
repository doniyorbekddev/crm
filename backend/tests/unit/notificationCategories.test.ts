import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_NOTIFICATION_CATEGORY_ALIASES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY,
  notificationTypesOf,
} from '../../src/config/notificationTypes.js';
import { NotificationType } from '../../src/generated/prisma/enums.js';
import { notificationListQuerySchema } from '../../src/validators/notification.validator.js';

/**
 * Bildirishnoma toifalari bitta joyda ta'riflanadi: `src/config/notificationTypes.ts`.
 * Bir marta ikkinchi, boshqacha guruhlangan ro'yxat paydo bo'lgan (ro'yxat filtri uchun) — bu testlar
 * shunday takrorlanish qaytib kelmasligini kafolatlaydi.
 */
const SRC = path.resolve(import.meta.dirname, '../../src');
const FRONTEND_LABELS = path.resolve(import.meta.dirname, '../../../frontend/src/utils/notificationLabels.ts');
const FRONTEND_TYPES = path.resolve(import.meta.dirname, '../../../frontend/src/types/notification.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('Bildirishnoma toifalari — yagona manba', () => {
  it('har tur aynan bitta toifaga tegishli va har toifada kamida bitta tur bor', () => {
    const types = Object.values(NotificationType);
    expect(Object.keys(NOTIFICATION_CATEGORY).sort()).toEqual([...types].sort());
    const covered = NOTIFICATION_CATEGORIES.flatMap((category) => notificationTypesOf(category));
    expect(covered.sort()).toEqual([...types].sort());
    for (const category of NOTIFICATION_CATEGORIES) expect(notificationTypesOf(category).length).toBeGreaterThan(0);
  });

  it('ro‘yxat filtri kanonik toifalarning o‘zini qabul qiladi (alohida ro‘yxati yo‘q)', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(notificationListQuerySchema.parse({ category }).category).toBe(category);
    }
    expect(() => notificationListQuerySchema.parse({ category: 'UNKNOWN' })).toThrow();
    expect(notificationListQuerySchema.parse({}).category).toBeUndefined();
  });

  it('eski nomlar kanonik toifaga o‘giriladi va o‘zlari kanonik ro‘yxatda yo‘q', () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_NOTIFICATION_CATEGORY_ALIASES)) {
      expect(NOTIFICATION_CATEGORIES).toContain(canonical);
      expect(NOTIFICATION_CATEGORIES as readonly string[]).not.toContain(legacy);
      expect(notificationListQuerySchema.parse({ category: legacy }).category).toBe(canonical);
    }
  });

  it('backend manbasida toifalar ro‘yxati va tur→toifa jadvali faqat bitta faylda e’lon qilingan', () => {
    const declaring = (pattern: RegExp) =>
      sourceFiles(SRC)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => path.relative(SRC, file));
    expect(declaring(/NOTIFICATION_CATEGORIES\s*=/)).toEqual(['config/notificationTypes.ts']);
    // `Record<NotificationType, NotificationCategory>` shaklidagi ikkinchi jadval ham bo'lmasin
    expect(declaring(/Record<NotificationType,\s*NotificationCategory>/)).toEqual(['config/notificationTypes.ts']);
  });

  it('frontenddagi nusxa backend bilan bir xil (tur→toifa va toifalar to‘plami)', () => {
    const labels = readFileSync(FRONTEND_LABELS, 'utf8');
    const block = /NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = \{([^}]*)\}/.exec(labels);
    expect(block).not.toBeNull();
    const mirror = Object.fromEntries([...block![1]!.matchAll(/(\w+):\s*'(\w+)'/g)].map((match) => [match[1], match[2]]));
    expect(mirror).toEqual(NOTIFICATION_CATEGORY);

    const order = /NOTIFICATION_CATEGORY_ORDER[^=]*=\s*\[([^\]]*)\]/.exec(labels);
    expect(order).not.toBeNull();
    expect([...order![1]!.matchAll(/'(\w+)'/g)].map((match) => match[1])).toEqual([...NOTIFICATION_CATEGORIES]);

    const union = /export type NotificationCategory = ([^;]*);/.exec(readFileSync(FRONTEND_TYPES, 'utf8'));
    expect(union).not.toBeNull();
    expect([...union![1]!.matchAll(/'(\w+)'/g)].map((match) => match[1]).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
  });
});
