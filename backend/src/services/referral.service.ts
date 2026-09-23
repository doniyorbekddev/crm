import { prisma } from '../config/database.js';
import type { Prisma, ReferralStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { discountService } from './discount.service.js';

/**
 * Referal tizimi — "do'stingni olib kel".
 *
 * Yo'l: o'quvchining kodi (R00045) bilan yangi lead keladi → `Referral` PENDING holatda yoziladi →
 * lead o'quvchiga aylansa CONVERTED → xodim bonusni **aniq harakat bilan** beradi (REWARDED).
 *
 * Bonus avtomatik berilmasligining sababi: bonus — bu chegirma, ya'ni haqiqiy pul. Avtomatik
 * berilsa markaz nazoratdan chiqadi; shuning uchun tugma bosiladi va audit yoziladi.
 */

/** Taklif bonusi qaysi chegirma qoidasidan olinadi */
export const REFERRAL_RULE_KEY = 'referral';

const referralSelect = {
  id: true,
  status: true,
  bonusAmount: true,
  rewardedAt: true,
  note: true,
  createdAt: true,
  referrer: { select: { id: true, number: true, firstName: true, lastName: true, referralCode: true } },
  referred: { select: { id: true, number: true, firstName: true, lastName: true } },
  lead: { select: { id: true, number: true, firstName: true, lastName: true, status: true } },
  rewardedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ReferralSelect;

type ReferralRecord = Prisma.ReferralGetPayload<{ select: typeof referralSelect }>;

export interface ReferralDto {
  id: string;
  status: ReferralStatus;
  bonusAmount: number;
  rewardedAt: string | null;
  rewardedBy: string | null;
  note: string | null;
  createdAt: string;
  referrer: { id: string; number: number; name: string; code: string | null };
  referred: { id: string; number: number; name: string } | null;
  lead: { id: string; number: number; name: string; status: string } | null;
}

function toDto(record: ReferralRecord): ReferralDto {
  return {
    id: record.id,
    status: record.status,
    bonusAmount: record.bonusAmount.toNumber(),
    rewardedAt: record.rewardedAt?.toISOString() ?? null,
    rewardedBy: record.rewardedBy ? `${record.rewardedBy.firstName} ${record.rewardedBy.lastName}` : null,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    referrer: {
      id: record.referrer.id,
      number: record.referrer.number,
      name: `${record.referrer.firstName} ${record.referrer.lastName}`,
      code: record.referrer.referralCode,
    },
    referred: record.referred
      ? { id: record.referred.id, number: record.referred.number, name: `${record.referred.firstName} ${record.referred.lastName}` }
      : null,
    lead: record.lead
      ? {
          id: record.lead.id,
          number: record.lead.number,
          name: [record.lead.firstName, record.lead.lastName].filter(Boolean).join(' '),
          status: record.lead.status,
        }
      : null,
  };
}

export interface ReferralStats {
  /** Jami taklif qilingan leadlar */
  total: number;
  /** O'quvchiga aylanganlari */
  converted: number;
  /** Bonus berilganlari */
  rewarded: number;
  conversionPercent: number;
  /** Berilgan bonuslar yig'indisi (so'm) */
  bonusTotal: number;
  /** Taklif orqali kelgan o'quvchilardan tushgan to'lovlar */
  referralRevenue: number;
  /** Eng ko'p do'st olib kelganlar */
  top: Array<{ studentId: string; name: string; code: string | null; total: number; converted: number; bonus: number }>;
}

/** `R00045` ko'rinishidagi kodni normallashtiradi (probel, kichik harf, R yo'qligi) */
export function normalizeReferralCode(code: string): string {
  const trimmed = code.trim().toUpperCase().replace(/\s+/g, '');
  return trimmed.startsWith('R') ? trimmed : `R${trimmed.padStart(5, '0')}`;
}

export const referralService = {
  /** Kod bo'yicha taklif qiluvchini topadi (forma tekshiruvi uchun) */
  async findByCode(code: string): Promise<{ id: string; number: number; name: string; code: string } | null> {
    const student = await prisma.student.findFirst({
      where: { referralCode: normalizeReferralCode(code), deletedAt: null },
      select: { id: true, number: true, firstName: true, lastName: true, referralCode: true },
    });
    if (!student) return null;
    return {
      id: student.id,
      number: student.number,
      name: `${student.firstName} ${student.lastName}`,
      code: student.referralCode ?? '',
    };
  },

  /**
   * Lead yaratilganda chaqiriladi. Kod noto'g'ri bo'lsa lead baribir yaratiladi —
   * taklif yozuvisiz (sotuvni to'xtatish kodga qaraganda qimmatroq).
   */
  async attachToLead(tx: Prisma.TransactionClient, leadId: string, code: string): Promise<string | null> {
    const referrer = await tx.student.findFirst({
      where: { referralCode: normalizeReferralCode(code), deletedAt: null },
      select: { id: true },
    });
    if (!referrer) return null;
    const created = await tx.referral.create({
      data: { referrerStudentId: referrer.id, leadId, status: 'PENDING' },
      select: { id: true },
    });
    return created.id;
  },

  /** Lead o'quvchiga aylanganda chaqiriladi */
  async onLeadConverted(tx: Prisma.TransactionClient, leadId: string, studentId: string): Promise<void> {
    const referral = await tx.referral.findUnique({ where: { leadId }, select: { id: true, referrerStudentId: true, status: true } });
    if (!referral || referral.status !== 'PENDING') return;
    // O'zini o'zi taklif qilish holati (kod xato kiritilgan) — yozuv bekor qilinadi
    if (referral.referrerStudentId === studentId) {
      await tx.referral.update({ where: { id: referral.id }, data: { status: 'CANCELLED', note: 'O‘zini o‘zi taklif qilib bo‘lmaydi' } });
      return;
    }
    await tx.referral.update({ where: { id: referral.id }, data: { status: 'CONVERTED', referredStudentId: studentId } });
  },

  async list(query: { page: number; limit: number; status?: ReferralStatus | undefined; studentId?: string | undefined }): Promise<{
    items: ReferralDto[];
    total: number;
  }> {
    const where: Prisma.ReferralWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { referrerStudentId: query.studentId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.referral.findMany({ where, select: referralSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query.page, query.limit) }),
      prisma.referral.count({ where }),
    ]);
    return { items: items.map(toDto), total };
  },

  async stats(): Promise<ReferralStats> {
    const byStatus = await prisma.referral.groupBy({ by: ['status'], _count: { _all: true }, _sum: { bonusAmount: true } });
    const count = (status: ReferralStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
    const converted = count('CONVERTED') + count('REWARDED');
    const rewarded = count('REWARDED');
    const bonusTotal = byStatus.reduce((sum, row) => sum + (row._sum.bonusAmount?.toNumber() ?? 0), 0);

    // Taklif orqali kelgan o'quvchilardan tushgan haqiqiy pul
    const referred = await prisma.referral.findMany({
      where: { referredStudentId: { not: null } },
      select: { referredStudentId: true },
    });
    const referredIds = referred.map((row) => row.referredStudentId!).filter(Boolean);
    const revenue =
      referredIds.length > 0
        ? await prisma.payment.aggregate({ where: { studentId: { in: referredIds }, deletedAt: null }, _sum: { amount: true } })
        : null;

    const grouped = await prisma.referral.groupBy({
      by: ['referrerStudentId'],
      _count: { _all: true },
      _sum: { bonusAmount: true },
      orderBy: { _count: { referrerStudentId: 'desc' } },
      take: 5,
    });
    const topStudents = await prisma.student.findMany({
      where: { id: { in: grouped.map((row) => row.referrerStudentId) } },
      select: { id: true, firstName: true, lastName: true, referralCode: true },
    });
    const convertedCounts = await prisma.referral.groupBy({
      by: ['referrerStudentId'],
      where: { referrerStudentId: { in: grouped.map((row) => row.referrerStudentId) }, status: { in: ['CONVERTED', 'REWARDED'] } },
      _count: { _all: true },
    });
    const byStudent = new Map(topStudents.map((student) => [student.id, student]));
    const convertedByStudent = new Map(convertedCounts.map((row) => [row.referrerStudentId, row._count._all]));

    return {
      total,
      converted,
      rewarded,
      conversionPercent: total > 0 ? Math.round((converted / total) * 100) : 0,
      bonusTotal,
      referralRevenue: revenue?._sum.amount?.toNumber() ?? 0,
      top: grouped.map((row) => {
        const student = byStudent.get(row.referrerStudentId);
        return {
          studentId: row.referrerStudentId,
          name: student ? `${student.firstName} ${student.lastName}` : '—',
          code: student?.referralCode ?? null,
          total: row._count._all,
          converted: convertedByStudent.get(row.referrerStudentId) ?? 0,
          bonus: row._sum.bonusAmount?.toNumber() ?? 0,
        };
      }),
    };
  },

  /**
   * Bonusni taklif qilgan o'quvchiga chegirma sifatida beradi. Qoida `discount_rules` dan
   * olinadi — ya'ni bonus miqdorini markaz o'zi belgilaydi va keyin o'zgartira oladi.
   */
  async reward(actor: AuthUser, id: string, client: ClientInfo): Promise<ReferralDto> {
    const referral = await prisma.referral.findUnique({
      where: { id },
      select: { id: true, status: true, referrerStudentId: true, referredStudentId: true },
    });
    if (!referral) throw AppError.notFound('Taklif topilmadi');
    if (referral.status === 'REWARDED') throw AppError.conflict('Bu taklif uchun bonus allaqachon berilgan');
    if (referral.status !== 'CONVERTED') {
      throw AppError.unprocessable('Bonus faqat lead o‘quvchiga aylangandan keyin beriladi');
    }

    const rule = await prisma.discountRule.findUnique({ where: { key: REFERRAL_RULE_KEY }, select: { id: true, name: true, valueType: true, value: true, isActive: true } });
    if (!rule || !rule.isActive) {
      throw AppError.unprocessable('Referal bonusi qoidasi sozlanmagan — chegirma qoidalarida «referral» ni yoqing');
    }

    // Chegirma cheklovlari (umumiy chegara, stacking) shu yerda ham tekshiriladi
    const evaluation = await discountService.evaluate(referral.referrerStudentId, { ruleKey: REFERRAL_RULE_KEY });

    await prisma.$transaction(async (tx) => {
      const discountId = await discountService.grantInTransaction(tx, {
        studentId: referral.referrerStudentId,
        ruleId: rule.id,
        label: rule.name,
        type: 'REFERRAL',
        valueType: rule.valueType,
        value: rule.value.toNumber(),
        amount: evaluation.amount,
        note: 'Do‘st taklif qilgani uchun bonus',
        grantedById: actor.id,
      });
      await tx.referral.update({
        where: { id },
        data: { status: 'REWARDED', bonusAmount: evaluation.amount, bonusDiscountId: discountId, rewardedById: actor.id, rewardedAt: new Date() },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'referral.rewarded',
        entityType: 'student',
        entityId: referral.referrerStudentId,
        metadata: { referralId: id, amount: evaluation.amount, discountId, referredStudentId: referral.referredStudentId },
        ...client,
      });
    });

    const updated = await prisma.referral.findUniqueOrThrow({ where: { id }, select: referralSelect });
    return toDto(updated);
  },

  async cancel(actor: AuthUser, id: string, reason: string, client: ClientInfo): Promise<ReferralDto> {
    const referral = await prisma.referral.findUnique({ where: { id }, select: { id: true, status: true, referrerStudentId: true } });
    if (!referral) throw AppError.notFound('Taklif topilmadi');
    if (referral.status === 'REWARDED') throw AppError.conflict('Bonus berilgan taklifni bekor qilib bo‘lmaydi');

    await prisma.$transaction(async (tx) => {
      await tx.referral.update({ where: { id }, data: { status: 'CANCELLED', note: reason } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'referral.cancelled',
        entityType: 'student',
        entityId: referral.referrerStudentId,
        metadata: { referralId: id, reason },
        ...client,
      });
    });
    return toDto(await prisma.referral.findUniqueOrThrow({ where: { id }, select: referralSelect }));
  },
};
