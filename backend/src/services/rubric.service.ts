import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { RubricCriterion, RubricInput, UpdateRubricInput } from '../validators/homework.validator.js';
import { auditService } from './audit.service.js';
import type { RubricDto } from './homework.service.js';
import { permissionService } from './permission.service.js';

/**
 * Baholash mezonlari (TZ §20). Rubrika umumiy: har o'qituvchi hammasini tanlay oladi,
 * o'zgartirishni esa yaratgan o'qituvchi yoki admin (`group.manage`) qiladi.
 * O'chirilmaydi — `isActive: false` (vazifalarda ishlatilgan bo'lishi mumkin).
 */

const rubricSelect = {
  id: true,
  name: true,
  description: true,
  criteria: true,
  isActive: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.RubricSelect;

function toDto(row: Prisma.RubricGetPayload<{ select: typeof rubricSelect }>): RubricDto {
  return { ...row, criteria: (Array.isArray(row.criteria) ? row.criteria : []) as unknown as RubricCriterion[] };
}

async function assertCanEdit(actor: AuthUser, id: string) {
  const rubric = await prisma.rubric.findUnique({ where: { id }, select: { createdById: true, name: true } });
  if (!rubric) throw AppError.notFound('Rubrika topilmadi');
  if (rubric.createdById !== actor.id) {
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    if (!permissions.has(PERMISSIONS.GROUP_MANAGE)) throw AppError.forbidden('Rubrikani faqat uni yaratgan o‘qituvchi yoki admin o‘zgartiradi');
  }
  return rubric;
}

export const rubricService = {
  async list(includeInactive: boolean): Promise<RubricDto[]> {
    const rows = await prisma.rubric.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: rubricSelect,
    });
    return rows.map(toDto);
  },

  async create(actor: AuthUser, input: RubricInput, client: ClientInfo): Promise<RubricDto> {
    const rubric = await prisma.$transaction(async (tx) => {
      const created = await tx.rubric.create({
        data: { name: input.name, description: input.description ?? null, criteria: input.criteria, createdById: actor.id },
        select: rubricSelect,
      });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'rubric.created', entityType: 'rubric', entityId: created.id, after: { name: input.name, criteria: input.criteria }, ...client });
      return created;
    });
    return toDto(rubric);
  },

  async update(actor: AuthUser, id: string, input: UpdateRubricInput, client: ClientInfo): Promise<RubricDto> {
    const current = await assertCanEdit(actor, id);
    const rubric = await prisma.$transaction(async (tx) => {
      const updated = await tx.rubric.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description ?? null }),
          ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        select: rubricSelect,
      });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'rubric.updated', entityType: 'rubric', entityId: id, before: { name: current.name }, after: { name: updated.name, isActive: updated.isActive }, ...client });
      return updated;
    });
    return toDto(rubric);
  },
};
