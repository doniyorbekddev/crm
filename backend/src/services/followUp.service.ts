import { prisma } from '../config/database.js';
import { formatLeadNumber } from '../config/leadLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { FollowUpStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CompleteFollowUpInput,
  CreateFollowUpInput,
  FollowUpListQuery,
  FollowUpSummaryQuery,
  UpdateFollowUpInput,
} from '../validators/followUp.validator.js';
import { auditService } from './audit.service.js';
import { findVisibleLeadRef, getLeadAccess, syncLeadNextFollowUp, visibleLeadFilter } from './leadAccess.js';
import type { LeadAccess } from './leadAccess.js';
import { notificationService } from './notification.service.js';

const REMINDER_MINUTES_BEFORE = 30;

const personSelect = { select: { id: true, firstName: true, lastName: true } } as const;

const followUpSelect = {
  id: true,
  leadId: true,
  title: true,
  notes: true,
  dueAt: true,
  remindAt: true,
  status: true,
  completedAt: true,
  createdAt: true,
  assignedTo: personSelect,
  createdBy: personSelect,
  lead: { select: { id: true, number: true, firstName: true, lastName: true, phone: true, status: true } },
} satisfies Prisma.FollowUpSelect;

type FollowUpRecord = Prisma.FollowUpGetPayload<{ select: typeof followUpSelect }>;

/** OVERDUE bazada saqlanmaydi — muddati o‘tgan PENDING shu holatda qaytariladi */
export type FollowUpState = 'PENDING' | 'OVERDUE' | 'DONE' | 'CANCELLED';

export interface FollowUpDto {
  id: string;
  leadId: string;
  title: string;
  notes: string | null;
  dueAt: string;
  remindAt: string | null;
  status: FollowUpStatus;
  state: FollowUpState;
  completedAt: string | null;
  createdAt: string;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  lead: { id: string; code: string; firstName: string; lastName: string | null; phone: string };
}

export interface FollowUpSummaryDto {
  overdue: number;
  today: number;
  tomorrow: number;
  upcoming: number;
}

function toState(status: FollowUpStatus, dueAt: Date, now: Date): FollowUpState {
  if (status === 'PENDING') return dueAt.getTime() < now.getTime() ? 'OVERDUE' : 'PENDING';
  return status;
}

function toDto(record: FollowUpRecord, now: Date): FollowUpDto {
  return {
    id: record.id,
    leadId: record.leadId,
    title: record.title,
    notes: record.notes,
    dueAt: record.dueAt.toISOString(),
    remindAt: record.remindAt?.toISOString() ?? null,
    status: record.status,
    state: toState(record.status, record.dueAt, now),
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    assignedTo: record.assignedTo,
    createdBy: record.createdBy,
    lead: {
      id: record.lead.id,
      code: formatLeadNumber(record.lead.number),
      firstName: record.lead.firstName,
      lastName: record.lead.lastName,
      phone: record.lead.phone,
    },
  };
}

function leadName(lead: { firstName: string; lastName: string | null }): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
}

/**
 * Bo‘limlar: kechikkan (muddati o‘tgan), bugun, ertaga, keyingi kunlar, bajarilganlar.
 * "Bugun" bo‘limiga kun boshidan beri barcha vazifalar kiradi — shu sababli bugungi kechikkanlar
 * ikkala ro‘yxatda ham ko‘rinadi (sotuvchi ularni ko‘zdan qochirmasligi uchun).
 */
function scopeCondition(scope: FollowUpListQuery['scope'], now: Date): Prisma.FollowUpWhereInput | null {
  const dayStart = startOfBusinessDay(now);
  switch (scope) {
    case 'overdue':
      return { status: 'PENDING', dueAt: { lt: now } };
    case 'today':
      return { status: 'PENDING', dueAt: { gte: dayStart, lt: addDays(dayStart, 1) } };
    case 'tomorrow':
      return { status: 'PENDING', dueAt: { gte: addDays(dayStart, 1), lt: addDays(dayStart, 2) } };
    case 'upcoming':
      return { status: 'PENDING', dueAt: { gte: addDays(dayStart, 2) } };
    case 'done':
      return { status: { in: ['DONE', 'CANCELLED'] } };
    case 'all':
      return null;
  }
}

function buildWhere(
  access: LeadAccess,
  filters: { assignedTo?: string | undefined; leadId?: string | undefined; scope?: FollowUpListQuery['scope'] },
  now: Date,
): Prisma.FollowUpWhereInput {
  const conditions: Prisma.FollowUpWhereInput[] = [{ lead: visibleLeadFilter(access) }];
  if (filters.leadId) conditions.push({ leadId: filters.leadId });
  if (filters.assignedTo === 'me') conditions.push({ assignedToId: access.userId });
  else if (filters.assignedTo) conditions.push({ assignedToId: filters.assignedTo });
  if (filters.scope) {
    const scope = scopeCondition(filters.scope, now);
    if (scope) conditions.push(scope);
  }
  return { AND: conditions };
}

async function findVisibleFollowUp(access: LeadAccess, id: string) {
  const followUp = await prisma.followUp.findFirst({
    where: { id, lead: visibleLeadFilter(access) },
    select: { id: true, leadId: true, title: true, status: true, assignedToId: true, dueAt: true },
  });
  if (!followUp) {
    throw AppError.notFound('Follow-up topilmadi');
  }
  return followUp;
}

/** O‘ziga biriktirish hammaga ochiq; boshqa xodimga — faqat barcha leadlarni ko‘ra oladiganlarga. */
async function resolveAssignee(access: LeadAccess, assigneeId: string): Promise<string> {
  if (assigneeId === access.userId) return assigneeId;
  if (!access.canViewAll) {
    throw AppError.forbidden('Follow-upni faqat o‘zingizga biriktira olasiz');
  }
  const user = await prisma.user.findFirst({
    where: {
      id: assigneeId,
      deletedAt: null,
      status: 'ACTIVE',
      role: { permissions: { some: { permission: { key: PERMISSIONS.LEAD_VIEW } } } },
    },
    select: { id: true },
  });
  if (!user) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field: 'assignedToId', message: 'Xodim topilmadi yoki leadlar bilan ishlay olmaydi' },
    ]);
  }
  return user.id;
}

export const followUpService = {
  async list(actor: AuthUser, query: FollowUpListQuery): Promise<{ items: FollowUpDto[]; total: number }> {
    const access = await getLeadAccess(actor);
    const now = new Date();
    const where = buildWhere(access, query, now);
    const orderBy: Prisma.FollowUpOrderByWithRelationInput[] =
      query.scope === 'done' ? [{ completedAt: 'desc' }, { id: 'desc' }] : [{ dueAt: 'asc' }, { id: 'asc' }];

    const items = await prisma.followUp.findMany({
      where,
      select: followUpSelect,
      orderBy,
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.followUp.count({ where });
    return { items: items.map((item) => toDto(item, now)), total };
  },

  /** Tablardagi sonlar. So‘rovlar ketma-ket bajariladi (PGlite parallel ulanishni ko‘tarmaydi). */
  async summary(actor: AuthUser, filters: FollowUpSummaryQuery): Promise<FollowUpSummaryDto> {
    const access = await getLeadAccess(actor);
    const now = new Date();
    const counts: FollowUpSummaryDto = { overdue: 0, today: 0, tomorrow: 0, upcoming: 0 };
    for (const scope of ['overdue', 'today', 'tomorrow', 'upcoming'] as const) {
      counts[scope] = await prisma.followUp.count({ where: buildWhere(access, { ...filters, scope }, now) });
    }
    return counts;
  },

  async create(actor: AuthUser, input: CreateFollowUpInput, client: ClientInfo): Promise<FollowUpDto> {
    const access = await getLeadAccess(actor);
    const lead = await findVisibleLeadRef(access, input.leadId);
    const assigneeId = await resolveAssignee(access, input.assignedToId ?? lead.assignedToId ?? access.userId);
    const remindAt = input.remindAt ?? new Date(input.dueAt.getTime() - REMINDER_MINUTES_BEFORE * 60_000);

    const followUpId = await prisma.$transaction(async (tx) => {
      const created = await tx.followUp.create({
        data: {
          leadId: lead.id,
          assignedToId: assigneeId,
          createdById: actor.id,
          title: input.title,
          notes: input.notes ?? null,
          dueAt: input.dueAt,
          remindAt,
        },
        select: { id: true },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: actor.id,
          type: 'FOLLOW_UP_CREATED',
          description: `Follow-up yaratildi: ${input.title}`,
          metadata: { followUpId: created.id, dueAt: input.dueAt.toISOString() },
        },
      });
      await syncLeadNextFollowUp(tx, lead.id);

      if (assigneeId !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: assigneeId,
          type: 'FOLLOW_UP_REMINDER',
          title: 'Yangi follow-up',
          message: `${leadName(lead)} (${formatLeadNumber(lead.number)}): ${input.title}`,
          entityType: 'followUp',
          entityId: created.id,
          dedupeKey: `followup-assigned:${created.id}`,
        });
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'followup.created',
        entityType: 'followUp',
        entityId: created.id,
        metadata: { leadId: lead.id, dueAt: input.dueAt.toISOString() },
        ...client,
      });
      return created.id;
    });

    return toDto(await prisma.followUp.findUniqueOrThrow({ where: { id: followUpId }, select: followUpSelect }), new Date());
  },

  async update(actor: AuthUser, id: string, input: UpdateFollowUpInput, client: ClientInfo): Promise<FollowUpDto> {
    const access = await getLeadAccess(actor);
    const followUp = await findVisibleFollowUp(access, id);
    if (followUp.status !== 'PENDING') {
      throw AppError.conflict('Yakunlangan follow-upni tahrirlab bo‘lmaydi');
    }
    const assigneeId = input.assignedToId
      ? await resolveAssignee(access, input.assignedToId)
      : (followUp.assignedToId ?? access.userId);
    const remindAt = input.remindAt ?? new Date(input.dueAt.getTime() - REMINDER_MINUTES_BEFORE * 60_000);

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.followUp.update({
        where: { id },
        data: {
          title: input.title,
          notes: input.notes ?? null,
          dueAt: input.dueAt,
          remindAt,
          assignedToId: assigneeId,
          // Muddat o‘zgardi — eslatmalar qaytadan yuboriladi
          reminderSentAt: null,
          overdueNotifiedAt: null,
        },
        select: followUpSelect,
      });
      await syncLeadNextFollowUp(tx, followUp.leadId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'followup.updated',
        entityType: 'followUp',
        entityId: id,
        metadata: { leadId: followUp.leadId, dueAt: input.dueAt.toISOString() },
        ...client,
      });
      return record;
    });

    return toDto(updated, new Date());
  },

  /** Bajarildi deb belgilaydi; kerak bo‘lsa darhol keyingi follow-upni yaratadi. */
  async complete(actor: AuthUser, id: string, input: CompleteFollowUpInput, client: ClientInfo): Promise<FollowUpDto> {
    const access = await getLeadAccess(actor);
    const followUp = await findVisibleFollowUp(access, id);
    if (followUp.status !== 'PENDING') {
      throw AppError.conflict('Bu follow-up allaqachon yakunlangan');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.followUp.update({
        where: { id },
        data: { status: 'DONE', completedAt: new Date() },
        select: followUpSelect,
      });
      await tx.leadActivity.create({
        data: {
          leadId: followUp.leadId,
          userId: actor.id,
          type: 'FOLLOW_UP_COMPLETED',
          description: [`Follow-up bajarildi: ${followUp.title}`, input.comment].filter(Boolean).join('. ').slice(0, 500),
          metadata: { followUpId: id },
        },
      });

      if (input.nextDueAt) {
        const next = await tx.followUp.create({
          data: {
            leadId: followUp.leadId,
            assignedToId: followUp.assignedToId ?? actor.id,
            createdById: actor.id,
            title: input.nextTitle ?? followUp.title,
            dueAt: input.nextDueAt,
            remindAt: new Date(input.nextDueAt.getTime() - REMINDER_MINUTES_BEFORE * 60_000),
          },
          select: { id: true, title: true },
        });
        await tx.leadActivity.create({
          data: {
            leadId: followUp.leadId,
            userId: actor.id,
            type: 'FOLLOW_UP_CREATED',
            description: `Follow-up yaratildi: ${next.title}`,
            metadata: { followUpId: next.id, source: 'complete' },
          },
        });
      }

      await syncLeadNextFollowUp(tx, followUp.leadId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'followup.completed',
        entityType: 'followUp',
        entityId: id,
        metadata: { leadId: followUp.leadId },
        ...client,
      });
      return record;
    });

    return toDto(updated, new Date());
  },

  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getLeadAccess(actor);
    const followUp = await findVisibleFollowUp(access, id);

    await prisma.$transaction(async (tx) => {
      await tx.followUp.delete({ where: { id } });
      await syncLeadNextFollowUp(tx, followUp.leadId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'followup.deleted',
        entityType: 'followUp',
        entityId: id,
        metadata: { leadId: followUp.leadId, title: followUp.title },
        ...client,
      });
    });
  },
};
