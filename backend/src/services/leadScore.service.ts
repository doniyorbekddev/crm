import { prisma } from '../config/database.js';
import type { LeadStatus, LeadTemperature, Prisma } from '../generated/prisma/client.js';

/**
 * Lead scoring — "bu lead qanchalik qizigan?" degan savolga 0–100 ball bilan javob.
 *
 * Tamoyillar:
 *  - ball **faqat mavjud ma'lumotdan** yig'iladi (status, qo'ng'iroqlar, follow-up,
 *    tanlangan kurs, manba sifati, oxirgi aloqa vaqti) — qo'shimcha so'rov talab qilinmaydi;
 *  - har bir signal o'z sababini qaytaradi, shuning uchun xodim "nega 72 ball?" degan
 *    savolga javob ko'radi;
 *  - ball vaqt o'tishi bilan **pasayadi**: 14 kundan beri aloqa bo'lmasa sovuydi.
 */

export interface LeadScoreFactor {
  key: 'status' | 'calls' | 'engagement' | 'course' | 'followUp' | 'source' | 'recency';
  label: string;
  points: number;
  detail: string;
}

export interface LeadScoreResult {
  score: number;
  temperature: LeadTemperature;
  factors: LeadScoreFactor[];
  /** Eng katta hissa qo'shgan sabablar (tushuntirish uchun) */
  reasons: string[];
}

/** Bosqich bo'yicha asosiy ball — voronkada qanchalik uzoqqa borgani */
const STATUS_POINTS: Record<LeadStatus, number> = {
  NEW: 5,
  CONTACTED: 15,
  CALLBACK: 20,
  INTERESTED: 30,
  TRIAL_BOOKED: 40,
  TRIAL_ATTENDED: 50,
  NEGOTIATION: 55,
  WON: 60,
  LOST: 0,
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Yangi',
  CONTACTED: 'Bog‘lanildi',
  CALLBACK: 'Qayta qo‘ng‘iroq',
  INTERESTED: 'Qiziqdi',
  TRIAL_BOOKED: 'Sinov darsiga yozildi',
  TRIAL_ATTENDED: 'Sinov darsiga keldi',
  NEGOTIATION: 'Muzokara',
  WON: 'Sotildi',
  LOST: 'Yo‘qotildi',
};

const DAY_MS = 86_400_000;
/** Shu kundan keyin lead sovuy boshlaydi */
const STALE_AFTER_DAYS = 14;

export function temperatureFor(score: number): LeadTemperature {
  if (score >= 90) return 'VERY_HOT';
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}

export interface LeadScoreInput {
  status: LeadStatus;
  courseId: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  createdAt: Date;
  calls: Array<{ result: string | null }>;
  /** Manbaning tarixiy konversiyasi (0–100) va yopilgan leadlar soni */
  sourceConversion: { percent: number; closed: number } | null;
}

export function computeLeadScore(input: LeadScoreInput, now: Date = new Date()): LeadScoreResult {
  const factors: LeadScoreFactor[] = [];

  // 1. Voronka bosqichi — asosiy signal
  factors.push({
    key: 'status',
    label: 'Bosqich',
    points: STATUS_POINTS[input.status],
    detail: STATUS_LABELS[input.status],
  });

  // 2. Qo'ng'iroqlar: javob bergan qo'ng'iroq aloqa borligini bildiradi
  const answered = input.calls.filter((call) => call.result === 'ANSWERED' || call.result === 'INTERESTED').length;
  const interested = input.calls.filter((call) => call.result === 'INTERESTED').length;
  const refused = input.calls.filter((call) => call.result === 'NOT_INTERESTED' || call.result === 'WRONG_NUMBER').length;

  factors.push({
    key: 'calls',
    label: 'Qo‘ng‘iroqlar',
    points: Math.min(answered * 4, 12),
    detail: answered > 0 ? `${answered} ta javob berilgan qo‘ng‘iroq` : 'Javob berilgan qo‘ng‘iroq yo‘q',
  });

  factors.push({
    key: 'engagement',
    label: 'Qiziqish belgilari',
    points: Math.min(interested * 6, 12) - Math.min(refused * 8, 16),
    detail:
      refused > 0
        ? `${refused} marta rad javobi`
        : interested > 0
          ? `${interested} marta qiziqish bildirgan`
          : 'Aniq qiziqish belgisi yo‘q',
  });

  // 3. Kurs tanlangani — aniq maqsad bor
  factors.push({
    key: 'course',
    label: 'Kurs tanlangan',
    points: input.courseId ? 6 : 0,
    detail: input.courseId ? 'Qaysi kurs kerakligi ma’lum' : 'Kurs tanlanmagan',
  });

  // 4. Rejalashtirilgan follow-up — jarayon tirik
  factors.push({
    key: 'followUp',
    label: 'Rejalashtirilgan aloqa',
    points: input.nextFollowUpAt ? 5 : 0,
    detail: input.nextFollowUpAt ? 'Keyingi aloqa rejalashtirilgan' : 'Keyingi aloqa rejalashtirilmagan',
  });

  // 5. Manba sifati — shu kanal tarixda qanchalik yaxshi konversiya bergan
  const sourceBonus =
    input.sourceConversion && input.sourceConversion.closed >= 5
      ? Math.round((input.sourceConversion.percent / 100) * 10)
      : 0;
  factors.push({
    key: 'source',
    label: 'Manba sifati',
    points: sourceBonus,
    detail: input.sourceConversion
      ? `Kanal konversiyasi ${input.sourceConversion.percent}%`
      : 'Manba bo‘yicha tarix yetarli emas',
  });

  // 6. Yangilik: uzoq vaqt aloqa bo'lmasa lead sovuydi
  const lastTouch = input.lastContactedAt ?? input.createdAt;
  const daysSince = Math.floor((now.getTime() - lastTouch.getTime()) / DAY_MS);
  const staleness = daysSince <= 2 ? 8 : daysSince <= 7 ? 4 : daysSince <= STALE_AFTER_DAYS ? 0 : -Math.min((daysSince - STALE_AFTER_DAYS) * 2, 20);
  factors.push({
    key: 'recency',
    label: 'Oxirgi aloqa',
    points: staleness,
    detail: daysSince === 0 ? 'Bugun' : `${daysSince} kun oldin`,
  });

  const raw = factors.reduce((sum, factor) => sum + factor.points, 0);
  const score = Math.min(Math.max(raw, 0), 100);

  return {
    score,
    temperature: temperatureFor(score),
    factors,
    reasons: factors
      .filter((factor) => factor.points !== 0)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, 3)
      .map((factor) => `${factor.label}: ${factor.detail}`),
  };
}

/** Manbalar bo'yicha tarixiy konversiya — barcha leadlar uchun bir marta hisoblanadi */
async function loadSourceConversion(): Promise<Map<string, { percent: number; closed: number }>> {
  const rows = await prisma.lead.groupBy({
    by: ['sourceId', 'status'],
    where: { deletedAt: null, status: { in: ['WON', 'LOST'] } },
    _count: { _all: true },
  });
  const totals = new Map<string, { won: number; closed: number }>();
  for (const row of rows) {
    const entry = totals.get(row.sourceId) ?? { won: 0, closed: 0 };
    entry.closed += row._count._all;
    if (row.status === 'WON') entry.won += row._count._all;
    totals.set(row.sourceId, entry);
  }
  return new Map(
    [...totals.entries()].map(([sourceId, value]) => [
      sourceId,
      { percent: value.closed === 0 ? 0 : Math.round((value.won / value.closed) * 100), closed: value.closed },
    ]),
  );
}

export const leadScoreService = {
  /** Bitta lead uchun — profil sahifasida har safar yangidan hisoblanadi */
  async forLead(leadId: string, now: Date = new Date()): Promise<LeadScoreResult | null> {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: {
        status: true,
        courseId: true,
        sourceId: true,
        lastContactedAt: true,
        nextFollowUpAt: true,
        createdAt: true,
        calls: { select: { result: true } },
      },
    });
    if (!lead) return null;

    const conversion = await loadSourceConversion();
    return computeLeadScore(
      {
        status: lead.status,
        courseId: lead.courseId,
        lastContactedAt: lead.lastContactedAt,
        nextFollowUpAt: lead.nextFollowUpAt,
        createdAt: lead.createdAt,
        calls: lead.calls,
        sourceConversion: conversion.get(lead.sourceId) ?? null,
      },
      now,
    );
  },

  /** Yopilmagan barcha leadlarni qayta hisoblaydi (fon vazifasi) */
  async recalculateAll(now: Date = new Date()): Promise<{ updated: number; hot: number }> {
    const leads = await prisma.lead.findMany({
      where: { deletedAt: null, status: { notIn: ['WON', 'LOST'] } },
      select: {
        id: true,
        status: true,
        courseId: true,
        sourceId: true,
        lastContactedAt: true,
        nextFollowUpAt: true,
        createdAt: true,
        calls: { select: { result: true } },
      },
    });
    if (leads.length === 0) return { updated: 0, hot: 0 };

    const conversion = await loadSourceConversion();
    const stamp = new Date();
    let hot = 0;

    for (const lead of leads) {
      const result = computeLeadScore(
        {
          status: lead.status,
          courseId: lead.courseId,
          lastContactedAt: lead.lastContactedAt,
          nextFollowUpAt: lead.nextFollowUpAt,
          createdAt: lead.createdAt,
          calls: lead.calls,
          sourceConversion: conversion.get(lead.sourceId) ?? null,
        },
        now,
      );
      if (result.temperature === 'HOT' || result.temperature === 'VERY_HOT') hot += 1;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          score: result.score,
          temperature: result.temperature,
          scoreFactors: result.factors as unknown as Prisma.InputJsonValue,
          scoreUpdatedAt: stamp,
        },
      });
    }

    return { updated: leads.length, hot };
  },
};
