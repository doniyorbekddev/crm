import { describe, expect, it } from 'vitest';
import { BlueprintShortageError, apportion, blueprintSchema, generateVariant, planCells, shuffle } from '../../src/services/examBlueprint.js';
import type { PoolQuestion } from '../../src/services/examBlueprint.js';

/** Deterministik "tasodif" — testlar takrorlanuvchan bo'lsin */
function seeded(seed = 7) {
  let state = seed;
  return (max: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % max;
  };
}

function pool(spec: Record<string, Partial<Record<'EASY' | 'MEDIUM' | 'HARD', number>>>): PoolQuestion[] {
  const items: PoolQuestion[] = [];
  for (const [topicId, levels] of Object.entries(spec)) {
    for (const [difficulty, count] of Object.entries(levels)) {
      for (let index = 0; index < (count ?? 0); index += 1) {
        items.push({ id: `${topicId}-${difficulty}-${index}`, topicId, difficulty: difficulty as PoolQuestion['difficulty'] });
      }
    }
  }
  return items;
}

describe('imtihon blueprinti (TZ §23–24)', () => {
  it('eng katta qoldiq usuli: yig‘indi aniq saqlanadi', () => {
    expect(apportion(10, [33, 33, 34])).toEqual([3, 3, 4]);
    expect(apportion(50, [30, 50, 20])).toEqual([15, 25, 10]);
    expect(apportion(7, [1, 1, 1])).toEqual([3, 2, 2]);
    expect(apportion(5, [0, 0])).toEqual([0, 0]);
  });

  it('TZ misoli: 50 savol — Easy 15 / Medium 25 / Hard 10', () => {
    const bank = pool({ js: { EASY: 30, MEDIUM: 40, HARD: 20 } });
    const blueprint = blueprintSchema.parse({ total: 50, difficulty: { EASY: 30, MEDIUM: 50, HARD: 20 } });
    const ids = generateVariant(bank, blueprint, seeded());
    const count = (level: string) => ids.filter((id) => id.includes(`-${level}-`)).length;
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect([count('EASY'), count('MEDIUM'), count('HARD')]).toEqual([15, 25, 10]);
  });

  it('mavzu × qiyinlik kataklari va yetmaganda shu mavzudan to‘ldirish', () => {
    const bank = pool({ arrays: { EASY: 1, MEDIUM: 5 }, async: { EASY: 3, HARD: 3 } });
    const blueprint = blueprintSchema.parse({ total: 6, topics: [{ topicId: 'arrays', percent: 50 }, { topicId: 'async', percent: 50 }], difficulty: { EASY: 50, MEDIUM: 0, HARD: 50 } });
    const cells = planCells(blueprint, bank);
    expect(cells.map((cell) => [cell.topicId, cell.difficulty, cell.target, cell.available])).toEqual([
      ['arrays', 'EASY', 2, 1],
      ['arrays', 'HARD', 1, 0],
      ['async', 'EASY', 2, 3],
      ['async', 'HARD', 1, 3],
    ]);
    const ids = generateVariant(bank, blueprint, seeded(3));
    // Mavzu ulushi saqlanadi: arrays EASY yetmadi → arrays MEDIUM dan olinadi
    expect(ids.filter((id) => id.startsWith('arrays-'))).toHaveLength(3);
    expect(ids.filter((id) => id.startsWith('async-'))).toHaveLength(3);
  });

  it('har chaqiruvda boshqa variant (o‘quvchilarga turli savollar), bank tashqarisidan olinmaydi', () => {
    const bank = pool({ a: { MEDIUM: 20 }, b: { MEDIUM: 20 } });
    const blueprint = blueprintSchema.parse({ total: 5, topics: [{ topicId: 'a', percent: 100 }] });
    const first = generateVariant(bank, blueprint);
    const second = generateVariant(bank, blueprint);
    const third = generateVariant(bank, blueprint);
    expect([first, second, third].every((ids) => ids.every((id) => id.startsWith('a-')))).toBe(true);
    expect(new Set([first.join(), second.join(), third.join()]).size).toBeGreaterThan(1);
  });

  it('savol yetmasa aniq xato va kataklar hisoboti', () => {
    const bank = pool({ a: { EASY: 2 } });
    const blueprint = blueprintSchema.parse({ total: 5 });
    expect(() => generateVariant(bank, blueprint)).toThrow(BlueprintShortageError);
    try {
      generateVariant(bank, blueprint);
    } catch (error) {
      expect((error as BlueprintShortageError).message).toContain('2 ta bor, 5 ta kerak');
    }
  });

  it('validatsiya: ulushlar 100%, mavzu takrorlanmaydi', () => {
    expect(blueprintSchema.safeParse({ total: 10, topics: [{ topicId: 'a', percent: 60 }, { topicId: 'b', percent: 30 }] }).success).toBe(false);
    expect(blueprintSchema.safeParse({ total: 10, topics: [{ topicId: 'a', percent: 50 }, { topicId: 'a', percent: 50 }] }).success).toBe(false);
    expect(blueprintSchema.safeParse({ total: 10, difficulty: { EASY: 50, MEDIUM: 40, HARD: 20 } }).success).toBe(false);
    expect(blueprintSchema.safeParse({ total: 0 }).success).toBe(false);
  });

  it('shuffle elementlarni yo‘qotmaydi va takrorlamaydi', () => {
    const items = Array.from({ length: 30 }, (_, index) => index);
    const mixed = shuffle(items, seeded(11));
    expect([...mixed].sort((a, b) => a - b)).toEqual(items);
    expect(mixed).not.toEqual(items);
  });
});
