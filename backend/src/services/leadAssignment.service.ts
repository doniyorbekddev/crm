import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { startOfBusinessDay } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';

/**
 * Yangi leadlarni managerlarga avtomatik taqsimlash (weighted round-robin).
 *
 * Qoida: eng uzoq vaqt lead olmagan xodim navbatda birinchi turadi. Vazn (`weight`)
 * ulushni belgilaydi: vazni 2 bo'lgan xodim vazni 1 bo'lgandan ikki barobar tez navbatga
 * qaytadi. Kunlik limitga yetgan xodim navbatdan chetlatiladi.
 *
 * Hech kim mos kelmasa `null` qaytadi — lead biriktirilmagan holda qoladi va uni
 * xodim qo'lda oladi (avtomatika ishlamay qolsa jarayon to'xtamasligi uchun).
 */

export interface AssignmentRuleDto {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  weight: number;
  dailyLimit: number;
  isActive: boolean;
  lastAssignedAt: string | null;
  /** Bugun shu xodimga nechta lead biriktirilgan */
  assignedToday: number;
}

const ruleSelect = {
  id: true,
  userId: true,
  weight: true,
  dailyLimit: true,
  isActive: true,
  lastAssignedAt: true,
  user: { select: { firstName: true, lastName: true, email: true, deletedAt: true, status: true } },
} satisfies Prisma.LeadAssignmentRuleSelect;

/** Vazn bo'yicha "kutish vaqti": vazn kattaroq bo'lsa navbat tezroq keladi */
function priorityOf(lastAssignedAt: Date | null, weight: number, now: Date): number {
  const waited = lastAssignedAt === null ? Number.MAX_SAFE_INTEGER / 2 : now.getTime() - lastAssignedAt.getTime();
  return waited * weight;
}

export const leadAssignmentService = {
  async list(): Promise<AssignmentRuleDto[]> {
    const rules = await prisma.leadAssignmentRule.findMany({ select: ruleSelect, orderBy: { createdAt: 'asc' } });
    const today = startOfBusinessDay(new Date());
    const counts = await prisma.lead.groupBy({
      by: ['assignedToId'],
      where: { assignedToId: { in: rules.map((rule) => rule.userId) }, createdAt: { gte: today }, deletedAt: null },
      _count: { _all: true },
    });
    const byUser = new Map(counts.map((row) => [row.assignedToId, row._count._all]));

    return rules.map((rule) => ({
      id: rule.id,
      userId: rule.userId,
      fullName: `${rule.user.firstName} ${rule.user.lastName}`,
      email: rule.user.email,
      weight: rule.weight,
      dailyLimit: rule.dailyLimit,
      isActive: rule.isActive && rule.user.deletedAt === null && rule.user.status === 'ACTIVE',
      lastAssignedAt: rule.lastAssignedAt?.toISOString() ?? null,
      assignedToday: byUser.get(rule.userId) ?? 0,
    }));
  },

  /** Qoidalarni to'liq almashtiradi — sozlamalar oynasidagi ro'yxat qanday bo'lsa, shunday saqlanadi */
  async replace(
    actor: AuthUser,
    rules: Array<{ userId: string; weight: number; dailyLimit: number; isActive: boolean }>,
    client: ClientInfo,
  ): Promise<AssignmentRuleDto[]> {
    const userIds = rules.map((rule) => rule.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw AppError.unprocessable('Bitta xodim ro‘yxatda ikki marta ko‘rsatilgan');
    }
    if (userIds.length > 0) {
      const found = await prisma.user.count({ where: { id: { in: userIds }, deletedAt: null, status: 'ACTIVE' } });
      if (found !== userIds.length) {
        throw AppError.unprocessable('Ba’zi xodimlar topilmadi yoki faol emas');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.leadAssignmentRule.deleteMany({ where: { userId: { notIn: userIds.length > 0 ? userIds : ['-'] } } });
      for (const rule of rules) {
        await tx.leadAssignmentRule.upsert({
          where: { userId: rule.userId },
          update: { weight: rule.weight, dailyLimit: rule.dailyLimit, isActive: rule.isActive },
          create: { userId: rule.userId, weight: rule.weight, dailyLimit: rule.dailyLimit, isActive: rule.isActive },
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lead.assignment_rules_updated',
        entityType: 'lead',
        entityId: 'rules',
        metadata: { count: rules.length },
        ...client,
      });
    });

    return this.list();
  },

  /**
   * Navbatdagi xodimni tanlaydi va navbatni suradi. Lead yaratish tranzaksiyasi ichida
   * chaqiriladi — shuning uchun `tx` qabul qiladi.
   */
  async pickAssignee(tx: Prisma.TransactionClient, now: Date = new Date()): Promise<string | null> {
    const rules = await tx.leadAssignmentRule.findMany({
      where: { isActive: true, user: { deletedAt: null, status: 'ACTIVE' } },
      select: { id: true, userId: true, weight: true, dailyLimit: true, lastAssignedAt: true },
    });
    if (rules.length === 0) return null;

    const today = startOfBusinessDay(now);
    const counts = await tx.lead.groupBy({
      by: ['assignedToId'],
      where: { assignedToId: { in: rules.map((rule) => rule.userId) }, createdAt: { gte: today }, deletedAt: null },
      _count: { _all: true },
    });
    const byUser = new Map(counts.map((row) => [row.assignedToId, row._count._all]));

    const available = rules.filter((rule) => rule.dailyLimit === 0 || (byUser.get(rule.userId) ?? 0) < rule.dailyLimit);
    if (available.length === 0) return null;

    const next = available.reduce((best, rule) =>
      priorityOf(rule.lastAssignedAt, rule.weight, now) > priorityOf(best.lastAssignedAt, best.weight, now) ? rule : best,
    );

    await tx.leadAssignmentRule.update({ where: { id: next.id }, data: { lastAssignedAt: now } });
    return next.userId;
  },
};
