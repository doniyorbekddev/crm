import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { getBranchAccess } from './branchAccess.js';
import type { BranchAccess } from './branchAccess.js';
import { permissionService } from './permission.service.js';

/**
 * Leadlar bilan bog‘liq barcha modullar (leadlar, qo‘ng‘iroqlar, follow-up) uchun umumiy
 * ko‘rinish doirasi: lead.view_all bo‘lmasa, xodim faqat o‘ziga biriktirilgan va
 * biriktirilmagan leadlarni (va ularga tegishli yozuvlarni) ko‘radi.
 */
export interface LeadAccess {
  userId: string;
  canViewAll: boolean;
  canAssign: boolean;
  canDelete: boolean;
  /** Filial doirasi — `branch.view_all` bo‘lmasa faqat o‘z filiali */
  branch: BranchAccess;
}

export async function getLeadAccess(actor: AuthUser): Promise<LeadAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    userId: actor.id,
    canViewAll: permissions.has(PERMISSIONS.LEAD_VIEW_ALL),
    canAssign: permissions.has(PERMISSIONS.LEAD_ASSIGN),
    canDelete: permissions.has(PERMISSIONS.LEAD_DELETE),
    branch: await getBranchAccess(actor),
  };
}

export function leadScopeCondition(access: LeadAccess): Prisma.LeadWhereInput | null {
  const conditions: Prisma.LeadWhereInput[] = [];
  if (!access.branch.canViewAll) conditions.push({ branchId: access.branch.branchId });
  if (!access.canViewAll) conditions.push({ OR: [{ assignedToId: access.userId }, { assignedToId: null }] });
  if (conditions.length === 0) return null;
  return conditions.length === 1 ? conditions[0]! : { AND: conditions };
}

/** Qo‘ng‘iroq va follow-up so‘rovlarida ishlatiladigan "ko‘rinadigan lead" sharti */
export function visibleLeadFilter(access: LeadAccess): Prisma.LeadWhereInput {
  const scope = leadScopeCondition(access);
  return { deletedAt: null, ...(scope ? { AND: [scope] } : {}) };
}

const leadRefSelect = {
  id: true,
  number: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  assignedToId: true,
} satisfies Prisma.LeadSelect;

export type LeadRef = Prisma.LeadGetPayload<{ select: typeof leadRefSelect }>;

export async function findVisibleLeadRef(access: LeadAccess, leadId: string): Promise<LeadRef> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, ...visibleLeadFilter(access) }, select: leadRefSelect });
  if (!lead) {
    throw AppError.notFound('Lead topilmadi');
  }
  return lead;
}

/**
 * Leadning "keyingi aloqa" sanasini eng yaqin bajarilmagan follow-up bo‘yicha yangilaydi.
 * Follow-up yaratilganda, o‘zgartirilganda, bajarilganda yoki o‘chirilganda chaqiriladi.
 */
export async function syncLeadNextFollowUp(tx: Prisma.TransactionClient, leadId: string): Promise<void> {
  const next = await tx.followUp.findFirst({
    where: { leadId, status: 'PENDING' },
    orderBy: { dueAt: 'asc' },
    select: { dueAt: true },
  });
  await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
}
