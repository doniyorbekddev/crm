import { CALL_RESULT_LABELS, CALL_STATUS_LABELS } from '../config/callLabels.js';
import { prisma } from '../config/database.js';
import { formatLeadNumber } from '../config/leadLabels.js';
import type { CallDirection, CallResult, CallStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CallListQuery, CreateCallInput, UpdateCallInput } from '../validators/call.validator.js';
import { auditService } from './audit.service.js';
import { findVisibleLeadRef, getLeadAccess, syncLeadNextFollowUp, visibleLeadFilter } from './leadAccess.js';
import type { LeadAccess } from './leadAccess.js';

const FOLLOW_UP_REMINDER_MINUTES = 30;

const personSelect = { select: { id: true, firstName: true, lastName: true } } as const;

const callSelect = {
  id: true,
  leadId: true,
  direction: true,
  status: true,
  result: true,
  calledAt: true,
  durationSec: true,
  notes: true,
  nextCallAt: true,
  createdAt: true,
  manager: personSelect,
  lead: { select: { id: true, number: true, firstName: true, lastName: true, phone: true, status: true } },
} satisfies Prisma.CallSelect;

type CallRecord = Prisma.CallGetPayload<{ select: typeof callSelect }>;

export interface CallDto {
  id: string;
  leadId: string;
  direction: CallDirection;
  status: CallStatus;
  result: CallResult | null;
  calledAt: string;
  durationSec: number;
  notes: string | null;
  nextCallAt: string | null;
  createdAt: string;
  manager: { id: string; firstName: string; lastName: string } | null;
  lead: { id: string; code: string; firstName: string; lastName: string | null; phone: string };
}

function toCallDto(call: CallRecord): CallDto {
  return {
    id: call.id,
    leadId: call.leadId,
    direction: call.direction,
    status: call.status,
    result: call.result,
    calledAt: call.calledAt.toISOString(),
    durationSec: call.durationSec,
    notes: call.notes,
    nextCallAt: call.nextCallAt?.toISOString() ?? null,
    createdAt: call.createdAt.toISOString(),
    manager: call.manager,
    lead: {
      id: call.lead.id,
      code: formatLeadNumber(call.lead.number),
      firstName: call.lead.firstName,
      lastName: call.lead.lastName,
      phone: call.lead.phone,
    },
  };
}

function buildWhere(access: LeadAccess, query: Partial<CallListQuery>): Prisma.CallWhereInput {
  const conditions: Prisma.CallWhereInput[] = [{ lead: visibleLeadFilter(access) }];
  if (query.leadId) conditions.push({ leadId: query.leadId });
  if (query.managerId === 'me') conditions.push({ managerId: access.userId });
  else if (query.managerId) conditions.push({ managerId: query.managerId });
  if (query.result) conditions.push({ result: query.result });
  if (query.status) conditions.push({ status: query.status });
  if (query.direction) conditions.push({ direction: query.direction });
  if (query.dateFrom || query.dateTo) {
    conditions.push({
      calledAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) },
    });
  }
  return { AND: conditions };
}

async function findVisibleCall(access: LeadAccess, id: string) {
  const call = await prisma.call.findFirst({
    where: { id, lead: visibleLeadFilter(access) },
    select: { id: true, leadId: true, calledAt: true, managerId: true },
  });
  if (!call) {
    throw AppError.notFound('Qo‘ng‘iroq topilmadi');
  }
  return call;
}

function describeCall(input: { result?: CallResult | undefined; status: CallStatus; durationSec: number }): string {
  const parts = [input.result ? CALL_RESULT_LABELS[input.result] : CALL_STATUS_LABELS[input.status]];
  if (input.durationSec >= 60) parts.push(`${Math.round(input.durationSec / 60)} daqiqa`);
  else if (input.durationSec > 0) parts.push(`${input.durationSec} soniya`);
  return `Qo‘ng‘iroq: ${parts.join(', ')}`;
}

export const callService = {
  async list(actor: AuthUser, query: CallListQuery): Promise<{ items: CallDto[]; total: number }> {
    const access = await getLeadAccess(actor);
    const where = buildWhere(access, query);
    // So‘rovlar ketma-ket: lokal dev bazasi (PGlite) ko‘p parallel ulanishni ko‘tarmaydi
    const items = await prisma.call.findMany({
      where,
      select: callSelect,
      orderBy: [{ calledAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.call.count({ where });
    return { items: items.map(toCallDto), total };
  },

  /**
   * Qo‘ng‘iroq yozuvi. Bajarilgan qo‘ng‘iroq leadning "oxirgi aloqa" sanasini yangilaydi,
   * "keyingi qo‘ng‘iroq" ko‘rsatilsa — avtomatik follow-up yaratiladi.
   */
  async create(actor: AuthUser, input: CreateCallInput, client: ClientInfo): Promise<CallDto> {
    const access = await getLeadAccess(actor);
    const lead = await findVisibleLeadRef(access, input.leadId);
    const calledAt = input.calledAt ?? new Date();

    const callId = await prisma.$transaction(async (tx) => {
      const created = await tx.call.create({
        data: {
          leadId: lead.id,
          managerId: actor.id,
          direction: input.direction,
          status: input.status,
          result: input.result ?? null,
          calledAt,
          durationSec: input.durationSec,
          notes: input.notes ?? null,
          nextCallAt: input.nextCallAt ?? null,
        },
        select: { id: true },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: actor.id,
          type: 'CALL_LOGGED',
          description: [describeCall(input), input.notes].filter(Boolean).join('. ').slice(0, 500),
          metadata: { callId: created.id, result: input.result ?? null, durationSec: input.durationSec },
        },
      });

      if (input.status === 'COMPLETED') {
        await tx.lead.update({ where: { id: lead.id }, data: { lastContactedAt: calledAt } });
      }

      if (input.nextCallAt) {
        const followUp = await tx.followUp.create({
          data: {
            leadId: lead.id,
            assignedToId: lead.assignedToId ?? actor.id,
            createdById: actor.id,
            title: 'Qayta qo‘ng‘iroq qilish',
            dueAt: input.nextCallAt,
            remindAt: new Date(input.nextCallAt.getTime() - FOLLOW_UP_REMINDER_MINUTES * 60_000),
            notes: input.notes ?? null,
          },
          select: { id: true },
        });
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: actor.id,
            type: 'FOLLOW_UP_CREATED',
            description: 'Follow-up yaratildi: Qayta qo‘ng‘iroq qilish',
            metadata: { followUpId: followUp.id, source: 'call' },
          },
        });
        await syncLeadNextFollowUp(tx, lead.id);
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'call.created',
        entityType: 'call',
        entityId: created.id,
        metadata: { leadId: lead.id, result: input.result ?? null },
        ...client,
      });
      return created.id;
    });

    return toCallDto(await prisma.call.findUniqueOrThrow({ where: { id: callId }, select: callSelect }));
  },

  async update(actor: AuthUser, id: string, input: UpdateCallInput, client: ClientInfo): Promise<CallDto> {
    const access = await getLeadAccess(actor);
    const call = await findVisibleCall(access, id);

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.call.update({
        where: { id },
        data: {
          direction: input.direction,
          status: input.status,
          result: input.result ?? null,
          calledAt: input.calledAt ?? call.calledAt,
          durationSec: input.durationSec,
          notes: input.notes ?? null,
          nextCallAt: input.nextCallAt ?? null,
        },
        select: callSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'call.updated',
        entityType: 'call',
        entityId: id,
        metadata: { leadId: call.leadId },
        ...client,
      });
      return record;
    });

    return toCallDto(updated);
  },

  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getLeadAccess(actor);
    const call = await findVisibleCall(access, id);

    await prisma.$transaction(async (tx) => {
      await tx.call.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'call.deleted',
        entityType: 'call',
        entityId: id,
        metadata: { leadId: call.leadId },
        ...client,
      });
    });
  },
};
