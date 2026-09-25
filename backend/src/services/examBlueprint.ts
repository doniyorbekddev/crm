import { randomInt } from 'node:crypto';
import { z } from 'zod';

/**
 * Imtihon blueprinti (TZ 3.0 §23–24): savollar bankidan **mavzu ulushi × qiyinlik ulushi**
 * bo'yicha tasodifiy variant. Masalan: 50 savol — Easy 15 / Medium 25 / Hard 10;
 * mavzular: Massivlar 20%, Funksiyalar 20%, …
 *
 * Sof funksiya (DB'siz) — shuning uchun unit testda to'liq tekshiriladi.
 */

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type BlueprintDifficulty = (typeof DIFFICULTIES)[number];

const percent = z.coerce.number().int().min(0).max(100);

export const blueprintSchema = z
  .object({
    total: z.coerce.number().int().min(1, 'Kamida 1 savol').max(100, 'Ko‘pi bilan 100 savol'),
    topics: z
      .array(z.object({ topicId: z.string().trim().min(1).max(50), percent: percent.min(1) }))
      .max(30)
      .default([]),
    difficulty: z.object({ EASY: percent, MEDIUM: percent, HARD: percent }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.topics.length > 0) {
      const sum = value.topics.reduce((total, topic) => total + topic.percent, 0);
      if (sum !== 100) ctx.addIssue({ code: 'custom', path: ['topics'], message: `Mavzular ulushi 100% bo‘lishi kerak (hozir ${sum}%)` });
      if (new Set(value.topics.map((topic) => topic.topicId)).size !== value.topics.length) {
        ctx.addIssue({ code: 'custom', path: ['topics'], message: 'Mavzu takrorlanmasin' });
      }
    }
    if (value.difficulty) {
      const sum = value.difficulty.EASY + value.difficulty.MEDIUM + value.difficulty.HARD;
      if (sum !== 100) ctx.addIssue({ code: 'custom', path: ['difficulty'], message: `Qiyinlik ulushi 100% bo‘lishi kerak (hozir ${sum}%)` });
    }
  });

export type Blueprint = z.infer<typeof blueprintSchema>;

export interface PoolQuestion {
  id: string;
  topicId: string | null;
  difficulty: BlueprintDifficulty;
}

export interface BlueprintCell {
  topicId: string | null;
  difficulty: BlueprintDifficulty | null;
  target: number;
  available: number;
}

export class BlueprintShortageError extends Error {
  constructor(
    message: string,
    readonly cells: BlueprintCell[],
  ) {
    super(message);
  }
}

/** Kriptografik tasodif bilan Fisher–Yates (Math.random emas — variantni taxmin qilib bo'lmasin) */
export function shuffle<T>(items: readonly T[], rng: (max: number) => number = randomInt): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng(index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

/**
 * "Eng katta qoldiq" usuli: ulushlarni butun songa aylantiradi, yig'indi aniq `total` bo'ladi.
 * Masalan 10 × (33%, 33%, 34%) → 3, 3, 4.
 */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (weight / sum) * total);
  const floors = raw.map((value) => Math.floor(value));
  let left = total - floors.reduce((acc, value) => acc + value, 0);
  const order = raw.map((value, index) => ({ index, rest: value - floors[index]! })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const item of order) {
    if (left === 0) break;
    floors[item.index]! += 1;
    left -= 1;
  }
  return floors;
}

/** Blueprint kataklari: mavzu × qiyinlik va har biridagi maqsad soni */
export function planCells(blueprint: Blueprint, pool: readonly PoolQuestion[]): BlueprintCell[] {
  const topics: Array<{ topicId: string | null; percent: number }> = blueprint.topics.length > 0 ? blueprint.topics : [{ topicId: null, percent: 100 }];
  const levels: Array<{ difficulty: BlueprintDifficulty | null; percent: number }> = blueprint.difficulty
    ? DIFFICULTIES.map((difficulty) => ({ difficulty, percent: blueprint.difficulty![difficulty] })).filter((level) => level.percent > 0)
    : [{ difficulty: null, percent: 100 }];

  // Ikki bosqich: avval mavzu ulushi aniq saqlanadi, keyin har mavzu ichida qiyinlik taqsimlanadi.
  // Bir bosqichda yaxlitlansa mavzu ulushi buzilardi (50/50 → 4/2).
  const topicTargets = apportion(blueprint.total, topics.map((topic) => topic.percent));
  return topics.flatMap((topic, topicIndex) => {
    const levelTargets = apportion(topicTargets[topicIndex]!, levels.map((level) => level.percent));
    return levels.map((level, levelIndex) => ({
      topicId: topic.topicId,
      difficulty: level.difficulty,
      target: levelTargets[levelIndex]!,
      available: pool.filter((question) => matches(question, topic.topicId, level.difficulty)).length,
    }));
  });
}

function matches(question: PoolQuestion, topicId: string | null, difficulty: BlueprintDifficulty | null): boolean {
  return (topicId === null || question.topicId === topicId) && (difficulty === null || question.difficulty === difficulty);
}

/**
 * Bitta o'quvchi uchun variant. Katakda savol yetmasa — avval shu mavzuning boshqa qiyinligidan,
 * keyin shu qiyinlikning boshqa mavzusidan (blueprint mavzulari ichida) to'ldiriladi. Umuman
 * yetmasa — `BlueprintShortageError` (o'qituvchi savol qo'shishi yoki blueprintni o'zgartirishi kerak).
 */
export function generateVariant(pool: readonly PoolQuestion[], blueprint: Blueprint, rng: (max: number) => number = randomInt): string[] {
  const allowedTopics = blueprint.topics.length > 0 ? new Set(blueprint.topics.map((topic) => topic.topicId)) : null;
  const eligible = pool.filter((question) => allowedTopics === null || (question.topicId !== null && allowedTopics.has(question.topicId)));
  if (eligible.length < blueprint.total) {
    throw new BlueprintShortageError(`Savollar yetarli emas: ${eligible.length} ta bor, ${blueprint.total} ta kerak`, planCells(blueprint, eligible));
  }

  const cells = planCells(blueprint, eligible);
  const used = new Set<string>();
  const take = (filter: (question: PoolQuestion) => boolean, count: number): number => {
    const candidates = shuffle(eligible.filter((question) => !used.has(question.id) && filter(question)), rng);
    const picked = candidates.slice(0, count);
    for (const question of picked) used.add(question.id);
    return picked.length;
  };

  let shortfall: Array<{ cell: BlueprintCell; missing: number }> = [];
  for (const cell of cells) {
    const got = take((question) => matches(question, cell.topicId, cell.difficulty), cell.target);
    if (got < cell.target) shortfall.push({ cell, missing: cell.target - got });
  }
  // 1) shu mavzu, boshqa qiyinlik; 2) shu qiyinlik, boshqa mavzu; 3) istalgan ruxsat etilgan savol
  const fallbacks: Array<(cell: BlueprintCell) => (question: PoolQuestion) => boolean> = [
    (cell) => (question) => cell.topicId === null || question.topicId === cell.topicId,
    (cell) => (question) => cell.difficulty === null || question.difficulty === cell.difficulty,
    () => () => true,
  ];
  for (const fallback of fallbacks) {
    shortfall = shortfall
      .map((item) => ({ ...item, missing: item.missing - take(fallback(item.cell), item.missing) }))
      .filter((item) => item.missing > 0);
  }
  if (used.size < blueprint.total) {
    throw new BlueprintShortageError(`Savollar yetarli emas: ${used.size}/${blueprint.total}`, cells);
  }
  return [...used];
}
