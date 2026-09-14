import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PREFERENCE_KEYS, PREFERENCE_SCHEMAS } from '../validators/preference.validator.js';
import type { PreferenceKey } from '../validators/preference.validator.js';

/** Xodimning shaxsiy sozlamalari (promt 59-bo‘lim): faqat o‘ziniki o‘qiladi va yoziladi */
export const preferenceService = {
  async list(userId: string): Promise<Partial<Record<PreferenceKey, unknown>>> {
    const rows = await prisma.userPreference.findMany({
      where: { userId, key: { in: PREFERENCE_KEYS } },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  },

  async set(userId: string, key: PreferenceKey, rawValue: unknown): Promise<unknown> {
    const value = PREFERENCE_SCHEMAS[key].parse(rawValue) as Prisma.InputJsonValue;
    const saved = await prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value },
      update: { value },
      select: { value: true },
    });
    return saved.value;
  },
};
