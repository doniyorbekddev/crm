import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { ComplaintCategory, ComplaintEventType, ComplaintSeverity, ComplaintSource, ComplaintStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type {
  ComplaintAssignInput,
  ComplaintCreateInput,
  ComplaintListQuery,
  ComplaintStatusInput,
  StaffAppealInput,
} from '../../validators/org.validator.js';
import { auditService } from '../audit.service.js';
import { getBranchAccess, resolveBranchId } from '../branchAccess.js';
import type { BranchAccess } from '../branchAccess.js';
import { notificationService } from '../notification.service.js';
import type { NotificationInput } from '../notification.service.js';
import { permissionService } from '../permission.service.js';
import { ceoUsers, fullName, permissionHolders, personSelect, staffRoleWhere } from './common.js';
import type { Person } from './common.js';

/**
 * Murojaat va shikoyatlar (ORG §7).
 *
 * Yo'l: kiritildi (Yangi) → mas'ulga yo'naltirildi (Ko'rib chiqilmoqda) → hal etildi → yopildi.
 * Jiddiy holat (xavfsizlik, tazyiq, tahdid) yoki "kritik" murojaat yaratilishi bilan markaz rahbariga ko'tariladi.
 * Har qadam o'zgarmas tarixga (`complaint_events`) va audit jurnaliga yoziladi.
 *
 * Kim ko'radi:
 *  - `complaint.view` — filial doirasidagi murojaatlar; maxfiylari faqat `complaint.confidential` bilan;
 *  - hamma — o'zi kiritgan yoki o'ziga biriktirilganini;
 *  - murojaat kim haqida bo'lsa, u (rahbar huquqi bo'lsa ham) ko'rmaydi — `complaint.confidential` bundan mustasno.
 * Ko'ra olmaydigan murojaat uchun javob — 404.
 */

/** Javob berish muddati, soat — jiddiylikka qarab */
export const COMPLAINT_SLA_HOURS: Record<ComplaintSeverity, number> = { CRITICAL: 4, HIGH: 24, NORMAL: 72 };
const HOUR_MS = 3_600_000;
const OPEN_STATUSES: readonly ComplaintStatus[] = ['NEW', 'UNDER_REVIEW'];

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  SERVICE: 'Xizmat sifati',
  TEACHER: 'O‘qituvchi',
  PAYMENT: 'To‘lov',
  SCHEDULE: 'Dars jadvali',
  SAFETY: 'Xavfsizlik',
  STAFF_CONFLICT: 'Xodimlar o‘rtasidagi nizo',
  SUGGESTION: 'Taklif',
  OTHER: 'Boshqa',
};

const complaintSelect = {
  id: true,
  number: true,
  source: true,
  category: true,
  severity: true,
  status: true,
  title: true,
  description: true,
  contactName: true,
  contactPhone: true,
  confidential: true,
  dueAt: true,
  escalatedAt: true,
  resolution: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  branchId: true,
  reporterId: true,
  assigneeId: true,
  subjectUserId: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  subjectUser: personSelect,
  reporter: personSelect,
  assignee: personSelect,
} satisfies Prisma.ComplaintSelect;

type ComplaintRow = Prisma.ComplaintGetPayload<{ select: typeof complaintSelect }>;

export interface ComplaintDto {
  id: string;
  number: number;
  source: ComplaintSource;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  title: string;
  description: string;
  contactName: string | null;
  contactPhone: string | null;
  confidential: boolean;
  dueAt: string | null;
  overdue: boolean;
  escalatedAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  student: { id: string; firstName: string; lastName: string } | null;
  subjectUser: Person | null;
  reporter: Person | null;
  assignee: Person | null;
}

export interface ComplaintEventDto {
  id: string;
  type: ComplaintEventType;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus | null;
  note: string | null;
  actor: Person | null;
  createdAt: string;
}

export interface ComplaintDetailDto extends ComplaintDto {
  events: ComplaintEventDto[];
  can: { manage: boolean; work: boolean; close: boolean; escalate: boolean };
}

function isOverdue(row: { status: ComplaintStatus; dueAt: Date | null }, now: Date): boolean {
  return OPEN_STATUSES.includes(row.status) && row.dueAt !== null && row.dueAt < now;
}

function toDto(row: ComplaintRow, now = new Date()): ComplaintDto {
  return {
    id: row.id,
    number: row.number,
    source: row.source,
    category: row.category,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    confidential: row.confidential,
    dueAt: row.dueAt?.toISOString() ?? null,
    overdue: isOverdue(row, now),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    student: row.student,
    subjectUser: row.subjectUser,
    reporter: row.reporter,
    assignee: row.assignee,
  };
}

interface Scope {
  access: BranchAccess;
  view: boolean;
  manage: boolean;
  confidential: boolean;
}

async function loadScope(actor: AuthUser): Promise<Scope> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  return {
    access: await getBranchAccess(actor),
    view: permissions.has(PERMISSIONS.COMPLAINT_VIEW),
    manage: permissions.has(PERMISSIONS.COMPLAINT_MANAGE),
    confidential: permissions.has(PERMISSIONS.COMPLAINT_CONFIDENTIAL),
  };
}

function visibleWhere(actor: AuthUser, scope: Scope): Prisma.ComplaintWhereInput {
  const own: Prisma.ComplaintWhereInput[] = [{ reporterId: actor.id }, { assigneeId: actor.id }];
  if (!scope.view) return { OR: own };
  const branch: Prisma.ComplaintWhereInput = scope.access.canViewAll ? {} : { branchId: scope.access.branchId };
  // Prisma'da `OR` ichidagi bo'sh `{}` "hech narsa" degani — barcha filial ko'rinsa shart umuman qo'yilmaydi
  if (scope.confidential) return scope.access.canViewAll ? {} : { OR: [...own, branch] };
  // Rahbar huquqi bilan: maxfiy emas va o'zi haqida emas (SQL'da `NOT (x = y)` NULL qatorlarni ham tashlab yuboradi — shuning uchun aniq OR)
  return { OR: [...own, { AND: [branch, { confidential: false }, { OR: [{ subjectUserId: null }, { subjectUserId: { not: actor.id } }] }] }] };
}

async function findVisible(actor: AuthUser, scope: Scope, id: string): Promise<ComplaintRow> {
  const row = await prisma.complaint.findFirst({ where: { AND: [{ id }, visibleWhere(actor, scope)] }, select: complaintSelect });
  if (!row) throw AppError.notFound('Murojaat topilmadi');
  return row;
}

/** Mas'ul — faol xodim (kabinet emas), shu filialda yoki barcha filialni ko'radigan */
async function resolveStaff(userId: string, access: BranchAccess, field: string): Promise<Person> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: 'ACTIVE', role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!user) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field, message: 'Xodim topilmadi' }]);
  return user;
}

function label(row: { number: number; title: string }): string {
  return `#${row.number} · ${row.title}`;
}

/** Murojaatni ko'rishi kerak bo'lgan rahbarlar: `complaint.manage` egalari (maxfiyda — faqat maxfiyni ko'radiganlar) */
async function managersOf(branchId: string, confidential: boolean, except: string[]): Promise<string[]> {
  const holders = await permissionHolders(confidential ? PERMISSIONS.COMPLAINT_CONFIDENTIAL : PERMISSIONS.COMPLAINT_MANAGE, branchId);
  return holders.filter((userId) => !except.includes(userId));
}

async function addEvent(
  tx: Prisma.TransactionClient,
  complaintId: string,
  actorId: string | null,
  type: ComplaintEventType,
  extra: { fromStatus?: ComplaintStatus; toStatus?: ComplaintStatus; note?: string | null } = {},
): Promise<void> {
  await tx.complaintEvent.create({
    data: { complaintId, actorId, type, fromStatus: extra.fromStatus ?? null, toStatus: extra.toStatus ?? null, note: extra.note ?? null },
  });
}

function notice(userId: string, row: { id: string; number: number; title: string }, title: string, message: string, key: string): NotificationInput {
  return { userId, type: 'COMPLAINT_UPDATE', title, message, entityType: 'complaint', entityId: row.id, actionUrl: `/complaints?id=${row.id}`, dedupeKey: `complaint:${row.id}:${key}:${userId}` };
}

/** Markaz rahbariga ko'tarish: belgi bir marta qo'yiladi, rahbarlar xabar oladi */
async function escalateInTx(tx: Prisma.TransactionClient, row: { id: string; number: number; title: string }, actor: AuthUser | null, note: string, now: Date): Promise<boolean> {
  const claimed = await tx.complaint.updateMany({ where: { id: row.id, escalatedAt: null }, data: { escalatedAt: now, escalatedById: actor?.id ?? null } });
  if (claimed.count === 0) return false;
  await addEvent(tx, row.id, actor?.id ?? null, 'ESCALATED', { note });
  const leaders = (await ceoUsers()).map((user) => user.id).filter((userId) => userId !== actor?.id);
  await notificationService.createManyInTransaction(
    tx,
    leaders.map((userId) => notice(userId, row, '🚨 Murojaat rahbarga ko‘tarildi', `${label(row)} — ${note}`, `escalated:${now.getTime()}`)),
  );
  return true;
}

function canWork(row: ComplaintRow, actor: AuthUser, scope: Scope): boolean {
  return scope.manage || row.assigneeId === actor.id;
}

export const complaintService = {
  async list(actor: AuthUser, query: ComplaintListQuery): Promise<{ items: ComplaintDto[]; total: number; counts: Record<ComplaintStatus, number> & { overdue: number; escalated: number } }> {
    const scope = await loadScope(actor);
    const now = new Date();
    const base = visibleWhere(actor, scope);
    const filters: Prisma.ComplaintWhereInput[] = [base];
    if (query.scope === 'mine') filters.push({ OR: [{ reporterId: actor.id }, { assigneeId: actor.id }] });
    if (query.status) filters.push({ status: query.status });
    if (query.category) filters.push({ category: query.category });
    if (query.severity) filters.push({ severity: query.severity });
    if (query.overdue) filters.push({ status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } });
    if (query.search) {
      const number = Number.parseInt(query.search.replace(/^#/, ''), 10);
      filters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { contactName: { contains: query.search, mode: 'insensitive' } },
          ...(Number.isSafeInteger(number) ? [{ number }] : []),
        ],
      });
    }
    const where: Prisma.ComplaintWhereInput = { AND: filters };
    const [rows, total, grouped, overdue, escalated] = await Promise.all([
      prisma.complaint.findMany({
        where,
        // Ochiqlar avval, ular ichida — jiddiyroq va muddati yaqinroq
        orderBy: [{ status: 'asc' }, { severity: 'desc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: complaintSelect,
      }),
      prisma.complaint.count({ where }),
      prisma.complaint.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      prisma.complaint.count({ where: { AND: [base, { status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } }] } }),
      prisma.complaint.count({ where: { AND: [base, { status: { in: [...OPEN_STATUSES] }, escalatedAt: { not: null } }] } }),
    ]);
    const counts = { NEW: 0, UNDER_REVIEW: 0, RESOLVED: 0, CLOSED: 0, overdue, escalated };
    for (const row of grouped) counts[row.status] = row._count._all;
    return { items: rows.map((row) => toDto(row, now)), total, counts };
  },

  async getById(actor: AuthUser, id: string): Promise<ComplaintDetailDto> {
    const scope = await loadScope(actor);
    const row = await findVisible(actor, scope, id);
    const events = await prisma.complaintEvent.findMany({
      where: { complaintId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, fromStatus: true, toStatus: true, note: true, createdAt: true, actor: personSelect },
    });
    const work = canWork(row, actor, scope);
    return {
      ...toDto(row),
      events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      can: {
        manage: scope.manage,
        work,
        // Hal etilganini kirituvchi ham yopa oladi (natijadan rozi)
        close: scope.manage || (row.status === 'RESOLVED' && row.reporterId === actor.id),
        escalate: work && row.escalatedAt === null && OPEN_STATUSES.includes(row.status),
      },
    };
  },

  /** Qabul qiluvchi (qabulxona, sotuv, rahbar) murojaatni kiritadi */
  async create(actor: AuthUser, input: ComplaintCreateInput, client: ClientInfo): Promise<ComplaintDetailDto> {
    const access = await getBranchAccess(actor);
    if (input.studentId) {
      const student = await prisma.student.findFirst({ where: { id: input.studentId, deletedAt: null, ...(access.canViewAll ? {} : { branchId: access.branchId }) }, select: { id: true } });
      if (!student) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'studentId', message: 'O‘quvchi topilmadi' }]);
    }
    if (input.subjectUserId) await resolveStaff(input.subjectUserId, access, 'subjectUserId');
    const assignee = input.assigneeId ? await resolveStaff(input.assigneeId, access, 'assigneeId') : null;
    return this.open(actor, { ...input, assigneeId: assignee?.id ?? null, branchId: resolveBranchId(access) }, client);
  },

  /** Xodimning o'z rasmiy murojaati (nizo, taklif): faqat o'zi va rahbarlar ko'radi */
  async createAppeal(actor: AuthUser, input: StaffAppealInput, client: ClientInfo): Promise<ComplaintDetailDto> {
    const access = await getBranchAccess(actor);
    if (input.subjectUserId) {
      if (input.subjectUserId === actor.id) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'subjectUserId', message: 'O‘zingiz haqingizda murojaat yozilmaydi' }]);
      await resolveStaff(input.subjectUserId, access, 'subjectUserId');
    }
    return this.open(
      actor,
      {
        source: 'STAFF',
        category: input.category,
        severity: input.severity,
        title: input.title,
        description: input.description,
        subjectUserId: input.subjectUserId ?? null,
        // Nizo va xavfsizlik — har doim maxfiy; qolganida xodim tanlaydi
        confidential: input.category === 'STAFF_CONFLICT' || input.category === 'SAFETY' || input.confidential,
        assigneeId: null,
        branchId: resolveBranchId(access),
      },
      client,
    );
  },

  async open(
    actor: AuthUser,
    input: {
      source: ComplaintSource;
      category: ComplaintCategory;
      severity: ComplaintSeverity;
      title: string;
      description: string;
      studentId?: string | null;
      contactName?: string | null;
      contactPhone?: string | null;
      subjectUserId?: string | null;
      confidential: boolean;
      assigneeId: string | null;
      branchId: string;
    },
    client: ClientInfo,
  ): Promise<ComplaintDetailDto> {
    const now = new Date();
    // Xavfsizlik va nizo — jiddiy: rahbarga darhol (ORG §7.1 oxiri)
    const severity: ComplaintSeverity = input.category === 'SAFETY' ? 'CRITICAL' : input.severity;
    const confidential = input.confidential || input.category === 'STAFF_CONFLICT';
    const status: ComplaintStatus = input.assigneeId ? 'UNDER_REVIEW' : 'NEW';
    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.complaint.create({
        data: {
          source: input.source,
          category: input.category,
          severity,
          status,
          title: input.title,
          description: input.description,
          studentId: input.studentId ?? null,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          subjectUserId: input.subjectUserId ?? null,
          reporterId: actor.id,
          assigneeId: input.assigneeId,
          confidential,
          dueAt: new Date(now.getTime() + COMPLAINT_SLA_HOURS[severity] * HOUR_MS),
          createdAt: now,
          branchId: input.branchId,
        },
        select: { id: true, number: true, title: true },
      });
      await addEvent(tx, row.id, actor.id, 'CREATED', { toStatus: 'NEW' });
      if (input.assigneeId) await addEvent(tx, row.id, actor.id, 'ASSIGNED', { fromStatus: 'NEW', toStatus: 'UNDER_REVIEW', note: null });

      const managers = await managersOf(input.branchId, confidential, [actor.id]);
      const notifications: NotificationInput[] = managers.map((userId) =>
        notice(userId, row, severity === 'CRITICAL' ? '🚨 Jiddiy murojaat' : 'Yangi murojaat', `${label(row)} — ${COMPLAINT_CATEGORY_LABELS[input.category]}`, 'created'),
      );
      if (input.assigneeId && input.assigneeId !== actor.id && !managers.includes(input.assigneeId)) {
        notifications.push(notice(input.assigneeId, row, 'Sizga murojaat biriktirildi', label(row), 'assigned'));
      }
      await notificationService.createManyInTransaction(tx, notifications);
      if (severity === 'CRITICAL') await escalateInTx(tx, row, actor, 'Jiddiy holat — avtomatik', now);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'complaint.created',
        entityType: 'complaint',
        entityId: row.id,
        metadata: { number: row.number, source: input.source, category: input.category, severity, confidential },
        ...client,
      });
      return row.id;
    });
    return this.getById(actor, id);
  },

  /** Mas'ulga yo'naltirish — Yangi bo'lsa "Ko'rib chiqilmoqda"ga o'tadi */
  async assign(actor: AuthUser, id: string, input: ComplaintAssignInput, client: ClientInfo): Promise<ComplaintDetailDto> {
    const scope = await loadScope(actor);
    if (!scope.manage) throw AppError.forbidden('Murojaatni yo‘naltirishga ruxsat yo‘q');
    const row = await findVisible(actor, scope, id);
    if (!OPEN_STATUSES.includes(row.status)) throw AppError.unprocessable('Yopilgan yoki hal etilgan murojaat yo‘naltirilmaydi');
    const assignee = await resolveStaff(input.assigneeId, scope.access, 'assigneeId');
    if (assignee.id === row.subjectUserId) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'assigneeId', message: 'Murojaat shu xodim haqida — unga biriktirilmaydi' }]);
    if (assignee.id === row.assigneeId) throw AppError.unprocessable('Murojaat allaqachon shu xodimda');

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.complaint.updateMany({
        where: { id, assigneeId: row.assigneeId, status: row.status },
        data: { assigneeId: assignee.id, status: 'UNDER_REVIEW' },
      });
      if (claimed.count === 0) throw AppError.conflict('Murojaat hozirgina o‘zgartirildi — sahifani yangilang');
      await addEvent(tx, id, actor.id, 'ASSIGNED', { fromStatus: row.status, toStatus: 'UNDER_REVIEW', note: `${fullName(assignee)}${input.note ? ` — ${input.note}` : ''}` });
      if (assignee.id !== actor.id) {
        await notificationService.createInTransaction(tx, notice(assignee.id, row, 'Sizga murojaat biriktirildi', `${label(row)}${input.note ? ` — ${input.note}` : ''}`, `assigned:${Date.now()}`));
      }
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'complaint.assigned',
        entityType: 'complaint',
        entityId: id,
        before: { assigneeId: row.assigneeId, status: row.status },
        after: { assigneeId: assignee.id, status: 'UNDER_REVIEW' },
        ...client,
      });
    });
    return this.getById(actor, id);
  },

  /**
   * Holat: Ko'rib chiqilmoqda ↔ Hal etildi (yechim majburiy) → Yopildi.
   * Ishlash — mas'ul yoki rahbar; yopish — rahbar yoki (hal etilganini) kirituvchi; yopilganini qayta ochish — rahbar.
   */
  async changeStatus(actor: AuthUser, id: string, input: ComplaintStatusInput, client: ClientInfo): Promise<ComplaintDetailDto> {
    const scope = await loadScope(actor);
    const row = await findVisible(actor, scope, id);
    const work = canWork(row, actor, scope);
    const next = input.status;
    if (next === row.status) throw AppError.unprocessable('Murojaat allaqachon shu holatda');

    if (next === 'RESOLVED') {
      if (!work) throw AppError.forbidden('Murojaatni faqat mas’ul yoki rahbar hal etadi');
      if (!OPEN_STATUSES.includes(row.status)) throw AppError.unprocessable('Faqat ochiq murojaat hal etiladi');
      if (!input.note) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'note', message: 'Qanday hal etilganini yozing' }]);
    } else if (next === 'CLOSED') {
      const reporterCloses = row.status === 'RESOLVED' && row.reporterId === actor.id;
      if (!scope.manage && !reporterCloses) throw AppError.forbidden('Murojaatni rahbar yoki (hal etilgandan keyin) kirituvchi yopadi');
      // Hal etilmasdan yopish (takror, asossiz) — faqat sabab bilan
      if (row.status !== 'RESOLVED' && !input.note) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'note', message: 'Nega hal etilmasdan yopilayotganini yozing' }]);
    } else if (next === 'UNDER_REVIEW') {
      if (row.status === 'CLOSED' && !scope.manage) throw AppError.forbidden('Yopilgan murojaatni rahbar qayta ochadi');
      if (!work) throw AppError.forbidden('Murojaat ustida faqat mas’ul yoki rahbar ishlaydi');
      if (row.status !== 'NEW' && !input.note) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'note', message: 'Qayta ochish sababini yozing' }]);
    } else {
      throw AppError.unprocessable('Murojaatni "Yangi" holatiga qaytarib bo‘lmaydi');
    }

    const now = new Date();
    const data: Prisma.ComplaintUpdateManyMutationInput = { status: next };
    if (next === 'RESOLVED') Object.assign(data, { resolution: input.note, resolvedAt: now, resolvedById: actor.id });
    if (next === 'CLOSED') Object.assign(data, { closedAt: now, closedById: actor.id });
    if (next === 'UNDER_REVIEW') Object.assign(data, { resolvedAt: null, resolvedById: null, closedAt: null, closedById: null });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.complaint.updateMany({ where: { id, status: row.status }, data });
      if (claimed.count === 0) throw AppError.conflict('Murojaat hozirgina o‘zgartirildi — sahifani yangilang');
      await addEvent(tx, id, actor.id, 'STATUS_CHANGED', { fromStatus: row.status, toStatus: next, note: input.note ?? null });
      // Kirituvchi natijani biladi (o'zi o'zgartirmagan bo'lsa); qayta ochilsa — mas'ul
      const recipients = new Set<string>();
      if (next === 'RESOLVED' && row.reporterId && row.reporterId !== actor.id) recipients.add(row.reporterId);
      if (next === 'UNDER_REVIEW' && row.assigneeId && row.assigneeId !== actor.id) recipients.add(row.assigneeId);
      const titles: Record<ComplaintStatus, string> = { NEW: '', UNDER_REVIEW: 'Murojaat qayta ochildi', RESOLVED: 'Murojaat hal etildi', CLOSED: 'Murojaat yopildi' };
      await notificationService.createManyInTransaction(
        tx,
        [...recipients].map((userId) => notice(userId, row, titles[next], `${label(row)}${input.note ? ` — ${input.note.slice(0, 200)}` : ''}`, `${next.toLowerCase()}:${now.getTime()}`)),
      );
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'complaint.status_changed',
        entityType: 'complaint',
        entityId: id,
        metadata: { number: row.number, from: row.status, to: next, ...(input.note ? { note: input.note } : {}) },
        ...client,
      });
    });
    return this.getById(actor, id);
  },

  async escalate(actor: AuthUser, id: string, note: string, client: ClientInfo): Promise<ComplaintDetailDto> {
    const scope = await loadScope(actor);
    const row = await findVisible(actor, scope, id);
    if (!canWork(row, actor, scope)) throw AppError.forbidden('Murojaatni faqat mas’ul yoki rahbar ko‘taradi');
    if (!OPEN_STATUSES.includes(row.status)) throw AppError.unprocessable('Faqat ochiq murojaat rahbarga ko‘tariladi');
    await prisma.$transaction(async (tx) => {
      const done = await escalateInTx(tx, row, actor, note, new Date());
      if (!done) throw AppError.conflict('Murojaat allaqachon rahbarga ko‘tarilgan');
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'complaint.escalated', entityType: 'complaint', entityId: id, metadata: { number: row.number, note }, ...client });
    });
    return this.getById(actor, id);
  },

  /** Izoh — murojaatni ko'ra oladigan har kim; mas'ul va kirituvchi xabar oladi */
  async comment(actor: AuthUser, id: string, note: string): Promise<ComplaintDetailDto> {
    const scope = await loadScope(actor);
    const row = await findVisible(actor, scope, id);
    await prisma.$transaction(async (tx) => {
      await addEvent(tx, id, actor.id, 'COMMENT', { note });
      const recipients = [row.assigneeId, row.reporterId].filter((userId): userId is string => Boolean(userId) && userId !== actor.id);
      await notificationService.createManyInTransaction(
        tx,
        [...new Set(recipients)].map((userId) => notice(userId, row, 'Murojaatga izoh', `${label(row)} — ${fullName(actor)}: ${note.slice(0, 200)}`, `comment:${Date.now()}`)),
      );
    });
    return this.getById(actor, id);
  },

  /** Mas'ul tanlash uchun xodimlar ro'yxati (`complaint.manage`) */
  async assignees(actor: AuthUser): Promise<Array<Person & { roleName: string }>> {
    const access = await getBranchAccess(actor);
    const users = await prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });
    return users.map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, roleName: user.role.name }));
  },
};

/**
 * Muddati o'tgan ochiq murojaatlar (soatlik job): mas'ul va rahbarlarga bir marta eslatma.
 * Belgi shartli yangilash bilan qo'yiladi — parallel yurish ikki marta yubormaydi.
 */
export async function notifyOverdueComplaints(now: Date): Promise<number> {
  const rows = await prisma.complaint.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now }, overdueNotifiedAt: null },
    orderBy: { dueAt: 'asc' },
    take: 100,
    select: { id: true, number: true, title: true, assigneeId: true, confidential: true, branchId: true },
  });
  let sent = 0;
  for (const row of rows) {
    const managers = await managersOf(row.branchId, row.confidential, []);
    const recipients = [...new Set([...(row.assigneeId ? [row.assigneeId] : []), ...managers])];
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.complaint.updateMany({ where: { id: row.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } });
      if (claimed.count !== 1) return;
      await notificationService.createManyInTransaction(
        tx,
        recipients.map((userId) => notice(userId, row, '⏰ Murojaat muddati o‘tdi', `${label(row)} — hali hal etilmagan`, 'overdue')),
      );
      sent += 1;
    });
  }
  return sent;
}
