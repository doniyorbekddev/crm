import { prisma } from '../config/database.js';
import { LEAD_PRIORITY_LABELS, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, formatLeadNumber } from '../config/leadLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Gender, LeadActivityType, LeadPriority, LeadStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, startOfBusinessDay } from '../utils/dates.js';
import { splitSearchTerms, toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  AssignLeadInput,
  CreateLeadInput,
  CreateLeadNoteInput,
  LeadActivityQuery,
  LeadFilterQuery,
  LeadKanbanQuery,
  LeadListQuery,
  UpdateLeadInput,
  UpdateLeadStatusInput,
} from '../validators/lead.validator.js';
import { auditService } from './audit.service.js';
import { getLeadAccess, leadScopeCondition } from './leadAccess.js';
import type { LeadAccess } from './leadAccess.js';
import { notificationService } from './notification.service.js';
import { EXPORT_ROW_LIMIT, exportSubtitle } from '../utils/tableExport.js';
import type { ExportColumn, ExportTable } from '../utils/tableExport.js';
import { businessDateString } from '../utils/dates.js';

// ---------------------------------------------------------------------
// Select va DTO
// ---------------------------------------------------------------------

const personSelect = { select: { id: true, firstName: true, lastName: true } } as const;

const leadListSelect = {
  id: true,
  number: true,
  firstName: true,
  lastName: true,
  phone: true,
  telegram: true,
  email: true,
  status: true,
  priority: true,
  nextFollowUpAt: true,
  lastContactedAt: true,
  createdAt: true,
  updatedAt: true,
  source: { select: { id: true, key: true, name: true } },
  course: { select: { id: true, name: true } },
  assignedTo: personSelect,
  student: { select: { id: true, number: true } },
} satisfies Prisma.LeadSelect;

const leadDetailSelect = {
  ...leadListSelect,
  age: true,
  gender: true,
  address: true,
  notes: true,
  lostReason: true,
  convertedAt: true,
  createdBy: personSelect,
  _count: { select: { leadNotes: true, activities: true, calls: true, followUps: true } },
} satisfies Prisma.LeadSelect;

/** Tahrirlash va tekshiruvlar uchun leadning o‘z maydonlari */
const leadCoreSelect = {
  id: true,
  number: true,
  firstName: true,
  lastName: true,
  phone: true,
  telegram: true,
  email: true,
  age: true,
  gender: true,
  address: true,
  sourceId: true,
  courseId: true,
  priority: true,
  notes: true,
  status: true,
  assignedToId: true,
  student: { select: { id: true } },
} satisfies Prisma.LeadSelect;

type LeadListRecord = Prisma.LeadGetPayload<{ select: typeof leadListSelect }>;
type LeadDetailRecord = Prisma.LeadGetPayload<{ select: typeof leadDetailSelect }>;
type LeadCoreRecord = Prisma.LeadGetPayload<{ select: typeof leadCoreSelect }>;

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface LeadListItemDto {
  id: string;
  number: number;
  code: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  telegram: string | null;
  email: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: { id: string; key: string; name: string };
  course: { id: string; name: string } | null;
  assignedTo: PersonRef | null;
  student: { id: string; number: number } | null;
}

export interface LeadDetailDto extends LeadListItemDto {
  age: number | null;
  gender: Gender | null;
  address: string | null;
  notes: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  createdBy: PersonRef | null;
  counts: { notes: number; activities: number; calls: number; followUps: number };
}

export type LeadStatusSummary = Record<'ALL' | LeadStatus, number>;

export interface KanbanColumnDto {
  status: LeadStatus;
  total: number;
  items: LeadListItemDto[];
}

export interface LeadActivityDto {
  id: string;
  type: LeadActivityType;
  description: string;
  metadata: Prisma.JsonValue;
  createdAt: string;
  user: PersonRef | null;
}

export interface LeadNoteDto {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: PersonRef | null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toListItem(lead: LeadListRecord): LeadListItemDto {
  return {
    id: lead.id,
    number: lead.number,
    code: formatLeadNumber(lead.number),
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone,
    telegram: lead.telegram,
    email: lead.email,
    status: lead.status,
    priority: lead.priority,
    nextFollowUpAt: iso(lead.nextFollowUpAt),
    lastContactedAt: iso(lead.lastContactedAt),
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    source: lead.source,
    course: lead.course,
    assignedTo: lead.assignedTo,
    student: lead.student,
  };
}

function toDetail(lead: LeadDetailRecord): LeadDetailDto {
  return {
    ...toListItem(lead),
    age: lead.age,
    gender: lead.gender,
    address: lead.address,
    notes: lead.notes,
    lostReason: lead.lostReason,
    convertedAt: iso(lead.convertedAt),
    createdBy: lead.createdBy,
    counts: {
      notes: lead._count.leadNotes,
      activities: lead._count.activities,
      calls: lead._count.calls,
      followUps: lead._count.followUps,
    },
  };
}

function fullName(person: { firstName: string; lastName: string | null }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------
// Ruxsatlar va ko‘rinish doirasi
// ---------------------------------------------------------------------


function searchCondition(term: string): Prisma.LeadWhereInput {
  const conditions: Prisma.LeadWhereInput[] = [
    { firstName: { contains: term, mode: 'insensitive' } },
    { lastName: { contains: term, mode: 'insensitive' } },
    { telegram: { contains: term, mode: 'insensitive' } },
    { email: { contains: term, mode: 'insensitive' } },
  ];
  const digits = term.replace(/\D/g, '');
  if (digits.length >= 2) {
    conditions.push({ phone: { contains: digits } });
  }
  const numberMatch = /^(?:l-?)?0*(\d{1,9})$/i.exec(term);
  if (numberMatch?.[1]) {
    conditions.push({ number: Number(numberMatch[1]) });
  }
  return { OR: conditions };
}

function followUpCondition(filter: NonNullable<LeadFilterQuery['followUp']>): Prisma.LeadWhereInput {
  const now = new Date();
  const dayStart = startOfBusinessDay(now);
  switch (filter) {
    case 'overdue':
      return { nextFollowUpAt: { lt: now } };
    case 'today':
      return { nextFollowUpAt: { gte: dayStart, lt: addDays(dayStart, 1) } };
    case 'upcoming':
      return { nextFollowUpAt: { gte: now } };
    case 'none':
      return { nextFollowUpAt: null };
  }
}

function buildLeadWhere(
  access: LeadAccess,
  filters: Partial<LeadFilterQuery>,
  options: { ignoreStatus?: boolean } = {},
): Prisma.LeadWhereInput {
  const conditions: Prisma.LeadWhereInput[] = [];
  const scope = leadScopeCondition(access);
  if (scope) conditions.push(scope);

  if (!options.ignoreStatus && filters.status && filters.status.length > 0) {
    conditions.push({ status: { in: filters.status } });
  }
  if (filters.sourceId) conditions.push({ sourceId: filters.sourceId });
  if (filters.courseId) conditions.push({ courseId: filters.courseId });
  if (filters.priority) conditions.push({ priority: filters.priority });

  if (filters.assignedTo === 'me') conditions.push({ assignedToId: access.userId });
  else if (filters.assignedTo === 'unassigned') conditions.push({ assignedToId: null });
  else if (filters.assignedTo) conditions.push({ assignedToId: filters.assignedTo });

  if (filters.createdFrom || filters.createdTo) {
    conditions.push({
      createdAt: {
        ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
        ...(filters.createdTo ? { lte: filters.createdTo } : {}),
      },
    });
  }
  if (filters.followUp) conditions.push(followUpCondition(filters.followUp));

  for (const term of splitSearchTerms(filters.search)) {
    conditions.push(searchCondition(term));
  }

  return { deletedAt: null, AND: conditions };
}

function buildLeadOrderBy(sortBy: LeadListQuery['sortBy'], sortOrder: LeadListQuery['sortOrder']): Prisma.LeadOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'nextFollowUpAt':
      return [{ nextFollowUpAt: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }];
    case 'firstName':
      return [{ firstName: sortOrder }, { lastName: sortOrder }, { id: 'asc' }];
    case 'priority':
      return [{ priority: sortOrder }, { createdAt: 'desc' }];
    case 'number':
      return [{ number: sortOrder }];
    case 'updatedAt':
      return [{ updatedAt: sortOrder }, { id: 'asc' }];
    case 'createdAt':
      return [{ createdAt: sortOrder }, { id: 'asc' }];
  }
}

/** Foydalanuvchi ko‘ra oladigan leadni topadi; ko‘ra olmasa — 404 (mavjudligi oshkor qilinmaydi). */
async function findVisibleLead(access: LeadAccess, id: string): Promise<LeadCoreRecord> {
  const scope = leadScopeCondition(access);
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...(scope ? { AND: [scope] } : {}) },
    select: leadCoreSelect,
  });
  if (!lead) {
    throw AppError.notFound('Lead topilmadi');
  }
  return lead;
}

async function loadDetail(id: string): Promise<LeadDetailDto> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, select: leadDetailSelect });
  return toDetail(lead);
}

/** Manba va kurs mavjudligini tekshiradi (foreign key xatosi o‘rniga tushunarli xabar). */
async function resolveReferences(sourceId: string, courseId: string | undefined) {
  const [source, course] = await Promise.all([
    prisma.source.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
    courseId ? prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  const errors = [
    ...(!source ? [{ field: 'sourceId', message: 'Manba topilmadi' }] : []),
    ...(courseId && !course ? [{ field: 'courseId', message: 'Kurs topilmadi' }] : []),
  ];
  if (!source || errors.length > 0) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', errors);
  }
  return { source, course };
}

/**
 * Mas’ul xodimni tekshiradi: o‘ziga biriktirish — `lead.assign`, boshqaga — `lead.assign` + `lead.view_all`.
 * Mas’ul faol va leadlar bilan ishlay oladigan (`lead.view`) xodim bo‘lishi kerak.
 */
async function resolveAssignee(access: LeadAccess, assigneeId: string | null): Promise<PersonRef | null> {
  if (assigneeId === null) return null;
  if (!access.canAssign) {
    throw AppError.forbidden('Leadni xodimga biriktirish uchun ruxsatingiz yo‘q');
  }
  if (assigneeId !== access.userId && !access.canViewAll) {
    throw AppError.forbidden('Leadni faqat o‘zingizga biriktira olasiz');
  }
  const assignee = await prisma.user.findFirst({
    where: {
      id: assigneeId,
      deletedAt: null,
      status: 'ACTIVE',
      role: { permissions: { some: { permission: { key: PERMISSIONS.LEAD_VIEW } } } },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!assignee) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
      { field: 'assignedToId', message: 'Xodim topilmadi yoki leadlar bilan ishlay olmaydi' },
    ]);
  }
  return assignee;
}

async function addActivity(
  tx: Prisma.TransactionClient,
  input: { leadId: string; userId: string; type: LeadActivityType; description: string; metadata?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.leadActivity.create({
    data: {
      leadId: input.leadId,
      userId: input.userId,
      type: input.type,
      description: input.description.slice(0, 500),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

type LeadFieldValues = Pick<
  LeadCoreRecord,
  'firstName' | 'lastName' | 'phone' | 'telegram' | 'email' | 'age' | 'gender' | 'address' | 'sourceId' | 'courseId' | 'priority' | 'notes'
>;

function toLeadFields(input: UpdateLeadInput): LeadFieldValues {
  return {
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    phone: input.phone,
    telegram: input.telegram ?? null,
    email: input.email ?? null,
    age: input.age ?? null,
    gender: input.gender ?? null,
    address: input.address ?? null,
    sourceId: input.sourceId,
    courseId: input.courseId ?? null,
    priority: input.priority,
    notes: input.notes ?? null,
  };
}

const FIELD_LABELS: Record<keyof LeadFieldValues, string> = {
  firstName: 'ism',
  lastName: 'familiya',
  phone: 'telefon',
  telegram: 'telegram',
  email: 'email',
  age: 'yosh',
  gender: 'jins',
  address: 'manzil',
  sourceId: 'manba',
  courseId: 'kurs',
  priority: 'muhimlik',
  notes: 'izoh',
};

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export const leadService = {
  async list(actor: AuthUser, query: LeadListQuery): Promise<{ items: LeadListItemDto[]; total: number }> {
    const access = await getLeadAccess(actor);
    const where = buildLeadWhere(access, query);
    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: leadListSelect,
        orderBy: buildLeadOrderBy(query.sortBy, query.sortOrder),
        ...toSkipTake(query.page, query.limit),
      }),
      prisma.lead.count({ where }),
    ]);
    return { items: items.map(toListItem), total };
  },

  /** Filtrga mos leadlar — eksport uchun (sahifalashsiz, EXPORT_ROW_LIMIT gacha) */
  async exportTable(actor: AuthUser, query: LeadListQuery): Promise<ExportTable> {
    const access = await getLeadAccess(actor);
    const where = buildLeadWhere(access, query);
    const records = await prisma.lead.findMany({
      where,
      select: leadListSelect,
      orderBy: buildLeadOrderBy(query.sortBy, query.sortOrder),
      take: EXPORT_ROW_LIMIT,
    });
    const total = await prisma.lead.count({ where });

    const columns: ExportColumn[] = [
      { key: 'code', label: 'ID', type: 'text' },
      { key: 'name', label: 'Lead', type: 'text' },
      { key: 'phone', label: 'Telefon', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'priority', label: 'Muhimlik', type: 'text' },
      { key: 'source', label: 'Manba', type: 'text' },
      { key: 'course', label: 'Kurs', type: 'text' },
      { key: 'assignedTo', label: 'Mas’ul', type: 'text' },
      { key: 'nextFollowUpAt', label: 'Keyingi aloqa', type: 'date' },
      { key: 'createdAt', label: 'Qo‘shilgan', type: 'date' },
    ];
    const rows = records.map(toListItem).map((lead) => ({
      code: lead.code,
      name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      phone: lead.phone,
      status: LEAD_STATUS_LABELS[lead.status],
      priority: LEAD_PRIORITY_LABELS[lead.priority],
      source: lead.source.name,
      course: lead.course?.name ?? null,
      assignedTo: lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : null,
      nextFollowUpAt: lead.nextFollowUpAt ? businessDateString(new Date(lead.nextFollowUpAt)) : null,
      createdAt: businessDateString(new Date(lead.createdAt)),
    }));
    return { title: 'Leadlar', subtitle: exportSubtitle(rows.length, total), columns, rows, totals: null };
  },

  /** Statuslar bo‘yicha sonlar (tablar uchun) — status filtridan tashqari barcha filtrlarni hisobga oladi. */
  async summary(actor: AuthUser, filters: LeadFilterQuery): Promise<LeadStatusSummary> {
    const access = await getLeadAccess(actor);
    const groups = await prisma.lead.groupBy({
      by: ['status'],
      where: buildLeadWhere(access, filters, { ignoreStatus: true }),
      _count: { _all: true },
    });
    const summary = Object.fromEntries([['ALL', 0], ...LEAD_STATUS_ORDER.map((status) => [status, 0])]) as LeadStatusSummary;
    for (const group of groups) {
      summary[group.status] = group._count._all;
      summary.ALL += group._count._all;
    }
    return summary;
  },

  async kanban(actor: AuthUser, query: LeadKanbanQuery): Promise<KanbanColumnDto[]> {
    const access = await getLeadAccess(actor);
    const where = buildLeadWhere(access, query, { ignoreStatus: true });

    const groups = await prisma.lead.groupBy({ by: ['status'], where, _count: { _all: true } });
    const totals = new Map(groups.map((group) => [group.status, group._count._all]));

    // Ustunlar ketma-ket so‘raladi: bir vaqtda 9 ta parallel so‘rov lokal dev bazasi (PGlite)
    // ulanishni yopib yuborishiga olib keladi. Ketma-ket so‘rovlar har ikkala bazada barqaror.
    const columns: KanbanColumnDto[] = [];
    for (const status of LEAD_STATUS_ORDER) {
      const total = totals.get(status) ?? 0;
      const items =
        total === 0
          ? []
          : await prisma.lead.findMany({
              where: { AND: [where, { status }] },
              select: leadListSelect,
              orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
              take: query.perColumn,
            });
      columns.push({ status, total, items: items.map(toListItem) });
    }

    return columns;
  },

  async getById(actor: AuthUser, id: string): Promise<LeadDetailDto> {
    const access = await getLeadAccess(actor);
    await findVisibleLead(access, id);
    return loadDetail(id);
  },

  async create(actor: AuthUser, input: CreateLeadInput, client: ClientInfo): Promise<LeadDetailDto> {
    const access = await getLeadAccess(actor);
    const { source } = await resolveReferences(input.sourceId, input.courseId);
    const assignee = await resolveAssignee(access, input.assignedToId ?? null);

    if (!input.allowDuplicate) {
      const duplicate = await prisma.lead.findFirst({
        where: { phone: input.phone, deletedAt: null },
        select: { number: true },
      });
      if (duplicate) {
        throw AppError.conflict(`Bu telefon raqam bilan lead allaqachon mavjud (${formatLeadNumber(duplicate.number)})`, [
          { field: 'phone', message: 'Bu raqam bilan lead mavjud' },
        ]);
      }
    }

    const leadId = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: { ...toLeadFields(input), assignedToId: assignee?.id ?? null, createdById: actor.id },
        select: { id: true, number: true, firstName: true, lastName: true },
      });

      await addActivity(tx, {
        leadId: created.id,
        userId: actor.id,
        type: 'CREATED',
        description: `Lead yaratildi (manba: ${source.name})`,
      });
      if (assignee) {
        await addActivity(tx, {
          leadId: created.id,
          userId: actor.id,
          type: 'ASSIGNED',
          description: `Mas’ul xodim: ${fullName(assignee)}`,
          metadata: { from: null, to: assignee.id },
        });
        if (assignee.id !== actor.id) {
          await notificationService.createInTransaction(tx, {
            userId: assignee.id,
            type: 'NEW_LEAD',
            title: 'Yangi lead',
            message: `${fullName(created)} (${formatLeadNumber(created.number)}) sizga biriktirildi`,
            entityType: 'lead',
            entityId: created.id,
          });
        }
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lead.created',
        entityType: 'lead',
        entityId: created.id,
        metadata: { number: created.number, phone: input.phone, assignedToId: assignee?.id ?? null },
        ...client,
      });
      return created.id;
    });

    return loadDetail(leadId);
  },

  async update(actor: AuthUser, id: string, input: UpdateLeadInput, client: ClientInfo): Promise<LeadDetailDto> {
    const access = await getLeadAccess(actor);
    const lead = await findVisibleLead(access, id);
    await resolveReferences(input.sourceId, input.courseId);

    const next = toLeadFields(input);
    const changedFields = (Object.keys(next) as Array<keyof LeadFieldValues>).filter((field) => next[field] !== lead[field]);
    if (changedFields.length === 0) {
      return loadDetail(id);
    }

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: next });
      await addActivity(tx, {
        leadId: id,
        userId: actor.id,
        type: 'UPDATED',
        description: `Ma’lumotlar yangilandi: ${changedFields.map((field) => FIELD_LABELS[field]).join(', ')}`,
        metadata: { changes: changedFields.map((field) => ({ field, from: lead[field], to: next[field] })) },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lead.updated',
        entityType: 'lead',
        entityId: id,
        metadata: { fields: changedFields },
        ...client,
      });
    });

    return loadDetail(id);
  },

  async setStatus(actor: AuthUser, id: string, input: UpdateLeadStatusInput, client: ClientInfo): Promise<LeadDetailDto> {
    const access = await getLeadAccess(actor);
    const lead = await findVisibleLead(access, id);

    if (lead.status === input.status) {
      return loadDetail(id);
    }
    if (lead.student && input.status !== 'WON') {
      throw AppError.conflict('O‘quvchiga aylantirilgan leadning statusini o‘zgartirib bo‘lmaydi');
    }

    const lostReason = input.status === 'LOST' ? (input.lostReason ?? null) : null;
    const description = [
      `Status o‘zgardi: ${LEAD_STATUS_LABELS[lead.status]} → ${LEAD_STATUS_LABELS[input.status]}`,
      lostReason ? `Sabab: ${lostReason}` : null,
      input.comment ?? null,
    ]
      .filter(Boolean)
      .join('. ');

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { status: input.status, lostReason } });
      await addActivity(tx, {
        leadId: id,
        userId: actor.id,
        type: 'STATUS_CHANGED',
        description,
        metadata: { from: lead.status, to: input.status, lostReason, comment: input.comment ?? null },
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lead.status_changed',
        entityType: 'lead',
        entityId: id,
        metadata: { from: lead.status, to: input.status },
        ...client,
      });
    });

    return loadDetail(id);
  },

  async assign(actor: AuthUser, id: string, input: AssignLeadInput, client: ClientInfo): Promise<LeadDetailDto> {
    const access = await getLeadAccess(actor);
    const lead = await findVisibleLead(access, id);

    if (input.assignedToId === lead.assignedToId) {
      return loadDetail(id);
    }
    if (input.assignedToId === null && !access.canViewAll && lead.assignedToId !== access.userId) {
      throw AppError.forbidden('Bu leadni biriktirilmagan holatga qaytara olmaysiz');
    }
    const assignee = await resolveAssignee(access, input.assignedToId);

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { assignedToId: assignee?.id ?? null } });
      await addActivity(tx, {
        leadId: id,
        userId: actor.id,
        type: 'ASSIGNED',
        description: assignee ? `Mas’ul xodim: ${fullName(assignee)}` : 'Lead biriktirilmagan leadlar ro‘yxatiga qaytarildi',
        metadata: { from: lead.assignedToId, to: assignee?.id ?? null },
      });
      if (assignee && assignee.id !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: assignee.id,
          type: 'LEAD_ASSIGNED',
          title: 'Sizga lead biriktirildi',
          message: `${fullName(lead)} (${formatLeadNumber(lead.number)})`,
          entityType: 'lead',
          entityId: id,
        });
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lead.assigned',
        entityType: 'lead',
        entityId: id,
        metadata: { from: lead.assignedToId, to: assignee?.id ?? null },
        ...client,
      });
    });

    return loadDetail(id);
  },

  /** Soft delete — lead sotuv tarixi va hisobotlarda saqlanib qoladi. */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getLeadAccess(actor);
    const lead = await findVisibleLead(access, id);

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { deletedAt: new Date() } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'lead.deleted',
        entityType: 'lead',
        entityId: id,
        metadata: { number: lead.number, name: fullName(lead), phone: lead.phone },
        ...client,
      });
    });
  },

  async activities(actor: AuthUser, id: string, query: LeadActivityQuery): Promise<{ items: LeadActivityDto[]; total: number }> {
    const access = await getLeadAccess(actor);
    await findVisibleLead(access, id);
    const [items, total] = await Promise.all([
      prisma.leadActivity.findMany({
        where: { leadId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, type: true, description: true, metadata: true, createdAt: true, user: personSelect },
        ...toSkipTake(query.page, query.limit),
      }),
      prisma.leadActivity.count({ where: { leadId: id } }),
    ]);
    return {
      items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      total,
    };
  },

  async notes(actor: AuthUser, id: string): Promise<LeadNoteDto[]> {
    const access = await getLeadAccess(actor);
    await findVisibleLead(access, id);
    const notes = await prisma.leadNote.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, content: true, createdAt: true, updatedAt: true, author: personSelect },
    });
    return notes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() }));
  },

  async addNote(actor: AuthUser, id: string, input: CreateLeadNoteInput): Promise<LeadNoteDto> {
    const access = await getLeadAccess(actor);
    await findVisibleLead(access, id);

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.leadNote.create({
        data: { leadId: id, authorId: actor.id, content: input.content },
        select: { id: true, content: true, createdAt: true, updatedAt: true, author: personSelect },
      });
      await addActivity(tx, {
        leadId: id,
        userId: actor.id,
        type: 'NOTE_ADDED',
        description: `Izoh qo‘shildi: ${input.content}`,
        metadata: { noteId: created.id },
      });
      return created;
    });

    return { ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() };
  },

  /** Izohni muallifi yoki `lead.delete` ruxsati bor xodim o‘chira oladi. */
  async deleteNote(actor: AuthUser, id: string, noteId: string): Promise<void> {
    const access = await getLeadAccess(actor);
    await findVisibleLead(access, id);
    const note = await prisma.leadNote.findFirst({ where: { id: noteId, leadId: id }, select: { id: true, authorId: true } });
    if (!note) {
      throw AppError.notFound('Izoh topilmadi');
    }
    if (note.authorId !== actor.id && !access.canDelete) {
      throw AppError.forbidden('Faqat o‘zingiz yozgan izohni o‘chira olasiz');
    }
    await prisma.leadNote.delete({ where: { id: noteId } });
  },
};
