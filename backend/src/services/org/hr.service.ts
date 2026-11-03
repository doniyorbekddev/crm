import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import type { CandidateStage, HrChecklistKind, HrChecklistStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { addDays, businessDateString } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import type { CandidateHireInput, CandidateListQuery, CandidateSaveInput, CandidateStageInput, ChecklistCreateInput, ChecklistItemInput } from '../../validators/org.validator.js';
import { auditService } from '../audit.service.js';
import { branchFilter, getBranchAccess, resolveBranchId } from '../branchAccess.js';
import type { BranchAccess } from '../branchAccess.js';
import { employeeService } from '../employee.service.js';
import { notificationService } from '../notification.service.js';
import { permissionService } from '../permission.service.js';
import { ACTIVE_TASK_STATUSES } from '../task.service.js';
import { userService } from '../user.service.js';
import { assetService } from './assets.service.js';
import { ensureOrgCatalog, positionTitle, TEACHER_POSITION_KEY } from './catalogDefaults.js';
import { ceoUsers, fullName, personSelect, staffRoleWhere, toDateOnly } from './common.js';
import type { Person } from './common.js';

/**
 * HR jarayonlari: ishga qabul qilish (ORG §3.1), onboarding (§3.3) va offboarding (§12).
 *
 * Nomzod: Yangi → Suhbat → Demo dars → Taklif → (CEO qarori) Ishga olindi / Rad etildi. Yakuniy qaror — `hiring.decide`.
 * Ishga olinganda (o'qituvchi bo'lmasa) xodim kartasi lavozimning sinov muddati bilan yaratiladi va onboarding ochiladi.
 *
 * Ro'yxat bandlari ikki xil: oddiy (mas'ul belgilaydi) va **tizim bandlari** — holati CRM ma'lumotidan olinadi
 * (ochiq vazifalar, xodimdagi jihozlar, CRM kirish huquqi), shuning uchun "belgilab qo'yib, aslida bajarmaslik" bo'lmaydi.
 */

const STAGE_ORDER: readonly CandidateStage[] = ['NEW', 'INTERVIEW', 'DEMO', 'OFFER'];
const FINAL: readonly CandidateStage[] = ['HIRED', 'REJECTED', 'WITHDRAWN'];

// ---------------------------------------------------------------- nomzodlar

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  position: true,
  isTeacher: true,
  positionTitle: true,
  source: true,
  stage: true,
  interviewAt: true,
  demoAt: true,
  score: true,
  notes: true,
  decidedAt: true,
  decisionNote: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true,
  decidedBy: personSelect,
  createdBy: personSelect,
} satisfies Prisma.CandidateSelect;

type CandidateRow = Prisma.CandidateGetPayload<{ select: typeof candidateSelect }>;

export interface CandidateDto extends Omit<CandidateRow, 'interviewAt' | 'demoAt' | 'decidedAt' | 'createdAt' | 'updatedAt'> {
  /** Lavozim nomi (o'qituvchi — "O'qituvchi · fan") */
  positionLabel: string;
  interviewAt: string | null;
  demoAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDetailDto extends CandidateDto {
  events: Array<{ id: string; fromStage: CandidateStage | null; toStage: CandidateStage | null; note: string | null; actor: Person | null; createdAt: string }>;
  can: { manage: boolean; decide: boolean };
}

function candidateLabel(row: { isTeacher: boolean; position: string | null; positionTitle: string | null }): string {
  if (row.positionTitle) return row.positionTitle;
  if (row.isTeacher) return 'O‘qituvchi';
  return row.position ? positionTitle(row.position) : '—';
}

function toCandidateDto(row: CandidateRow): CandidateDto {
  return {
    ...row,
    positionLabel: candidateLabel(row),
    interviewAt: row.interviewAt?.toISOString() ?? null,
    demoAt: row.demoAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function permissionsOf(actor: AuthUser): Promise<ReadonlySet<string>> {
  return permissionService.getRolePermissions(actor.roleId);
}

async function findCandidate(access: BranchAccess, id: string): Promise<CandidateRow & { branchId: string }> {
  const row = await prisma.candidate.findFirst({ where: { id, ...branchFilter(access) }, select: { ...candidateSelect, branchId: true } });
  if (!row) throw AppError.notFound('Nomzod topilmadi');
  return row;
}

// ---------------------------------------------------------------- ro'yxatlar

interface ItemTemplate {
  key?: string;
  title: string;
  /** Mas'ul: rahbar (xodimning rahbari yoki bo'lim boshlig'i) yoki markaz rahbari */
  responsible: 'manager' | 'ceo';
}

/** ORG §3.3: tanishtirish — CEO; lavozim bo'yicha o'rgatish — bo'lim rahbari (Sales — Shodiya, Reception — Guli…) */
export const ONBOARDING_ITEMS: readonly ItemTemplate[] = [
  { title: 'Umumiy tanishtirish: markaz, jamoa, ichki qoidalar', responsible: 'ceo' },
  { key: 'job_description', title: 'Lavozim yo‘riqnomasi va mas’uliyatlar tushuntirildi', responsible: 'manager' },
  { title: 'Vazifalar va KPI mezonlari tushuntirildi', responsible: 'manager' },
  { key: 'crm_account', title: 'CRM hisobi ochildi va undan foydalanish o‘rgatildi', responsible: 'ceo' },
  { key: 'contract', title: 'Mehnat shartnomasi qonunchilikka muvofiq rasmiylashtirildi', responsible: 'ceo' },
  { title: 'Telegram ish guruhlariga qo‘shildi', responsible: 'manager' },
  { title: 'Lavozim bo‘yicha amaliy o‘rgatish (mentor bilan)', responsible: 'manager' },
];

/** ORG §12 */
export const OFFBOARDING_ITEMS: readonly ItemTemplate[] = [
  { key: 'reason', title: 'Ishdan ketish sababi va sanasi qayd qilindi', responsible: 'ceo' },
  { key: 'tasks', title: 'Vazifalar, follow-uplar va murojaatlar boshqa xodimga topshirildi', responsible: 'manager' },
  { key: 'assets', title: 'Jihozlar qaytarildi', responsible: 'manager' },
  { title: 'Hujjatlar qaytarildi', responsible: 'manager' },
  { key: 'access', title: 'CRM kirish huquqi bekor qilindi', responsible: 'ceo' },
  { title: 'Telegram guruhlari va boshqa tizimlardan chiqarildi', responsible: 'ceo' },
  { title: 'Yakuniy hisob-kitob amalga oshirildi', responsible: 'ceo' },
];

/** CRM ma'lumotidan tekshiriladigan bandlar */
const SYSTEM_KEYS = new Set(['tasks', 'assets', 'access', 'crm_account', 'contract']);

const checklistSelect = {
  id: true,
  kind: true,
  status: true,
  employeeId: true,
  userId: true,
  subjectName: true,
  reason: true,
  lastWorkingDay: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  branchId: true,
  createdBy: personSelect,
  completedBy: personSelect,
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, key: true, title: true, sortOrder: true, doneAt: true, note: true, responsible: personSelect, doneBy: personSelect },
  },
} satisfies Prisma.HrChecklistSelect;

type ChecklistRow = Prisma.HrChecklistGetPayload<{ select: typeof checklistSelect }>;

export interface SystemFacts {
  openWork: { tasks: number; followUps: number; complaints: number };
  assets: Array<{ id: string; inventoryNumber: string; name: string }>;
  account: { exists: boolean; active: boolean };
  contractSigned: boolean;
}

export interface ChecklistItemDto {
  id: string;
  key: string | null;
  title: string;
  responsible: Person | null;
  done: boolean;
  doneAt: string | null;
  doneBy: Person | null;
  note: string | null;
  /** Tizim bandi: holati CRM ma'lumotidan */
  system: boolean;
}

export interface ChecklistDto {
  id: string;
  kind: HrChecklistKind;
  status: HrChecklistStatus;
  employeeId: string | null;
  userId: string | null;
  subjectName: string;
  reason: string | null;
  lastWorkingDay: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: Person | null;
  completedBy: Person | null;
  progress: { done: number; total: number };
  items: ChecklistItemDto[];
}

export interface ChecklistDetailDto extends ChecklistDto {
  facts: SystemFacts;
}

async function systemFacts(row: { userId: string | null; employeeId: string | null }): Promise<SystemFacts> {
  const userId = row.userId;
  const [tasks, followUps, complaints, assets, user, employee] = await Promise.all([
    userId ? prisma.task.count({ where: { assigneeId: userId, status: { in: [...ACTIVE_TASK_STATUSES] } } }) : 0,
    userId ? prisma.followUp.count({ where: { assignedToId: userId, status: 'PENDING' } }) : 0,
    userId ? prisma.complaint.count({ where: { assigneeId: userId, status: { in: ['NEW', 'UNDER_REVIEW'] } } }) : 0,
    userId ? assetService.heldBy(userId) : Promise.resolve([]),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true } }) : null,
    row.employeeId ? prisma.employee.findUnique({ where: { id: row.employeeId }, select: { contractNumber: true } }) : null,
  ]);
  return {
    openWork: { tasks, followUps, complaints },
    assets,
    account: { exists: Boolean(user && !user.deletedAt), active: user?.status === 'ACTIVE' && !user.deletedAt },
    contractSigned: Boolean(employee?.contractNumber),
  };
}

/** Tizim bandining haqiqiy holati (null — oddiy band) */
function systemDone(key: string | null, kind: HrChecklistKind, facts: SystemFacts): boolean | null {
  if (!key || !SYSTEM_KEYS.has(key)) return null;
  switch (key) {
    case 'tasks':
      return facts.openWork.tasks + facts.openWork.followUps + facts.openWork.complaints === 0;
    case 'assets':
      return facts.assets.length === 0;
    case 'access':
      return kind === 'OFFBOARDING' ? !facts.account.active : null;
    case 'crm_account':
      return facts.account.active;
    case 'contract':
      return facts.contractSigned;
    default:
      return null;
  }
}

function toChecklistDto(row: ChecklistRow, facts: SystemFacts | null): ChecklistDto {
  const items: ChecklistItemDto[] = row.items.map((item) => {
    const auto = facts ? systemDone(item.key, row.kind, facts) : null;
    return {
      id: item.id,
      key: item.key,
      title: item.title,
      responsible: item.responsible,
      done: auto ?? item.doneAt !== null,
      doneAt: item.doneAt?.toISOString() ?? null,
      doneBy: item.doneBy,
      note: item.note,
      system: auto !== null,
    };
  });
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    employeeId: row.employeeId,
    userId: row.userId,
    subjectName: row.subjectName,
    reason: row.reason,
    lastWorkingDay: row.lastWorkingDay ? toDateOnly(row.lastWorkingDay) : null,
    dueDate: row.dueDate ? toDateOnly(row.dueDate) : null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    completedBy: row.completedBy,
    progress: { done: items.filter((item) => item.done).length, total: items.length },
    items,
  };
}

async function findChecklist(access: BranchAccess, id: string): Promise<ChecklistRow> {
  const row = await prisma.hrChecklist.findFirst({ where: { id, ...branchFilter(access) }, select: checklistSelect });
  if (!row) throw AppError.notFound('Ro‘yxat topilmadi');
  return row;
}

/** Mas'ullar: xodimning rahbari (yoki bo'lim boshlig'i), bo'lmasa — markaz rahbari */
async function responsibles(employeeId: string | null): Promise<{ manager: string | null; ceo: string | null }> {
  const ceo = (await ceoUsers())[0]?.id ?? null;
  if (!employeeId) return { manager: ceo, ceo };
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true, departmentRef: { select: { headUserId: true } } } });
  return { manager: employee?.managerId ?? employee?.departmentRef?.headUserId ?? ceo, ceo };
}

async function openChecklist(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  input: { kind: HrChecklistKind; employeeId: string | null; userId: string | null; subjectName: string; reason: string | null; lastWorkingDay: Date | null; dueDate: Date | null; branchId: string },
  people: { manager: string | null; ceo: string | null },
  clientInfo: ClientInfo,
): Promise<string> {
  const template = input.kind === 'ONBOARDING' ? ONBOARDING_ITEMS : OFFBOARDING_ITEMS;
  const now = new Date();
  const row = await tx.hrChecklist.create({
    data: {
      kind: input.kind,
      employeeId: input.employeeId,
      userId: input.userId,
      subjectName: input.subjectName,
      reason: input.reason,
      lastWorkingDay: input.lastWorkingDay,
      dueDate: input.dueDate,
      createdById: actor.id,
      branchId: input.branchId,
      items: {
        create: template.map((item, index) => ({
          key: item.key ?? null,
          title: item.title,
          sortOrder: index,
          responsibleId: people[item.responsible],
          // Sabab va sana ro'yxat ochilganda kiritiladi — band darhol bajarilgan
          ...(item.key === 'reason' ? { doneAt: now, doneById: actor.id, note: input.reason } : {}),
        })),
      },
    },
    select: { id: true },
  });
  const recipients = [...new Set([people.manager, people.ceo].filter((userId): userId is string => Boolean(userId) && userId !== actor.id))];
  await notificationService.createManyInTransaction(
    tx,
    recipients.map((userId) => ({
      userId,
      type: 'HR_UPDATE' as const,
      title: input.kind === 'ONBOARDING' ? 'Onboarding boshlandi' : 'Offboarding boshlandi',
      message: `${input.subjectName}: sizga biriktirilgan bandlar bor`,
      entityType: 'hr_checklist',
      entityId: row.id,
      actionUrl: `/hr-process?checklist=${row.id}`,
      dedupeKey: `checklist:${row.id}:opened:${userId}`,
    })),
  );
  await auditService.recordInTransaction(tx, {
    userId: actor.id,
    action: input.kind === 'ONBOARDING' ? 'onboarding.started' : 'offboarding.started',
    entityType: 'hr_checklist',
    entityId: row.id,
    metadata: { subject: input.subjectName, employeeId: input.employeeId, userId: input.userId, reason: input.reason, lastWorkingDay: input.lastWorkingDay ? toDateOnly(input.lastWorkingDay) : null },
    ...clientInfo,
  });
  return row.id;
}

export const hrService = {
  // ------------------------------------------------------------ nomzodlar
  async candidates(actor: AuthUser, query: CandidateListQuery): Promise<{ items: CandidateDto[]; counts: Record<CandidateStage, number> }> {
    const access = await getBranchAccess(actor);
    const base = branchFilter(access);
    const [rows, grouped] = await Promise.all([
      prisma.candidate.findMany({
        where: { ...base, ...(query.stage ? { stage: query.stage } : query.active ? { stage: { in: [...STAGE_ORDER] } } : {}), ...(query.search ? { OR: [{ firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] } : {}) },
        orderBy: [{ updatedAt: 'desc' }],
        take: 300,
        select: candidateSelect,
      }),
      prisma.candidate.groupBy({ by: ['stage'], where: base, _count: { _all: true } }),
    ]);
    const counts = { NEW: 0, INTERVIEW: 0, DEMO: 0, OFFER: 0, HIRED: 0, REJECTED: 0, WITHDRAWN: 0 };
    for (const row of grouped) counts[row.stage] = row._count._all;
    return { items: rows.map(toCandidateDto), counts };
  },

  async candidate(actor: AuthUser, id: string): Promise<CandidateDetailDto> {
    const access = await getBranchAccess(actor);
    const row = await findCandidate(access, id);
    const [events, permissions] = await Promise.all([
      prisma.candidateEvent.findMany({ where: { candidateId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, fromStage: true, toStage: true, note: true, createdAt: true, actor: personSelect } }),
      permissionsOf(actor),
    ]);
    return {
      ...toCandidateDto(row),
      events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      can: { manage: permissions.has(PERMISSIONS.HIRING_MANAGE), decide: permissions.has(PERMISSIONS.HIRING_DECIDE) },
    };
  },

  async saveCandidate(actor: AuthUser, id: string | null, input: CandidateSaveInput, clientInfo: ClientInfo): Promise<CandidateDetailDto> {
    const access = await getBranchAccess(actor);
    if (id) {
      const existing = await findCandidate(access, id);
      if (FINAL.includes(existing.stage)) throw AppError.unprocessable('Yakunlangan nomzod tahrirlanmaydi');
    }
    const data = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      position: input.isTeacher ? null : (input.position ?? null),
      isTeacher: input.isTeacher,
      positionTitle: input.positionTitle ?? null,
      source: input.source ?? null,
      interviewAt: input.interviewAt ?? null,
      demoAt: input.demoAt ?? null,
      score: input.score ?? null,
      notes: input.notes ?? null,
    };
    const saved = await prisma.$transaction(async (tx) => {
      const row = id
        ? await tx.candidate.update({ where: { id }, data, select: { id: true } })
        : await tx.candidate.create({ data: { ...data, createdById: actor.id, branchId: resolveBranchId(access), events: { create: { toStage: 'NEW', actorId: actor.id } } }, select: { id: true } });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: id ? 'candidate.updated' : 'candidate.created', entityType: 'candidate', entityId: row.id, metadata: { name: `${input.firstName} ${input.lastName}`, position: candidateLabel({ ...data }) }, ...clientInfo });
      return row.id;
    });
    return this.candidate(actor, saved);
  },

  /**
   * Bosqich: Yangi → Suhbat → Demo → Taklif — `hiring.manage`; rad etish — `hiring.decide` (sabab bilan);
   * nomzod o'zi voz kechdi — `hiring.manage`. Ishga olish — alohida `hire()` (xodim kartasi bilan).
   */
  async moveCandidate(actor: AuthUser, id: string, input: CandidateStageInput, clientInfo: ClientInfo): Promise<CandidateDetailDto> {
    const access = await getBranchAccess(actor);
    const permissions = await permissionsOf(actor);
    const row = await findCandidate(access, id);
    if (FINAL.includes(row.stage)) throw AppError.unprocessable('Nomzod bo‘yicha qaror allaqachon qabul qilingan');
    if (input.stage === row.stage) throw AppError.unprocessable('Nomzod allaqachon shu bosqichda');
    if (input.stage === 'REJECTED' && !permissions.has(PERMISSIONS.HIRING_DECIDE)) throw AppError.forbidden('Rad etish bo‘yicha qarorni markaz rahbari qabul qiladi');
    if (input.stage === 'REJECTED' && !input.note) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'note', message: 'Rad etish sababini yozing' }]);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.candidate.updateMany({
        where: { id, stage: row.stage },
        data: { stage: input.stage, ...(input.stage === 'REJECTED' ? { decidedById: actor.id, decidedAt: now, decisionNote: input.note ?? null } : {}) },
      });
      if (claimed.count === 0) throw AppError.conflict('Nomzod hozirgina o‘zgartirildi — sahifani yangilang');
      await tx.candidateEvent.create({ data: { candidateId: id, fromStage: row.stage, toStage: input.stage, note: input.note ?? null, actorId: actor.id } });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'candidate.stage_changed', entityType: 'candidate', entityId: id, metadata: { from: row.stage, to: input.stage, note: input.note ?? null }, ...clientInfo });
    });
    return this.candidate(actor, id);
  },

  /**
   * Ishga olish — markaz rahbari qarori. Xodim lavozimida: xodim kartasi (sinov muddati lavozimdan) yaratiladi;
   * o'qituvchida karta o'qituvchi profili orqali ochiladi. Ikkala holatda onboarding ro'yxati ochiladi.
   */
  async hire(actor: AuthUser, id: string, input: CandidateHireInput, clientInfo: ClientInfo): Promise<CandidateDetailDto & { checklistId: string }> {
    const access = await getBranchAccess(actor);
    const row = await findCandidate(access, id);
    if (FINAL.includes(row.stage)) throw AppError.unprocessable('Nomzod bo‘yicha qaror allaqachon qabul qilingan');
    if (!row.isTeacher && !row.position) throw AppError.unprocessable('Nomzodning lavozimi ko‘rsatilmagan');
    const key = row.isTeacher ? TEACHER_POSITION_KEY : row.position!;
    await ensureOrgCatalog(prisma);
    const position = await prisma.position.findUnique({ where: { key }, select: { probationMonths: true } });
    const probationEnd = input.probationEndDate ?? (position && position.probationMonths > 0 ? addMonths(input.hireDate, position.probationMonths) : null);

    // Xodim kartasi — xodimlar servisi orqali (tekshiruvlar, audit va ish tarixi bir joyda)
    let employeeId: string | null = null;
    if (!row.isTeacher) {
      const employee = await employeeService.create(
        actor,
        {
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone ?? undefined,
          email: row.email ?? undefined,
          position: row.position!,
          positionTitle: row.positionTitle ?? undefined,
          baseSalary: input.baseSalary ?? 0,
          hireDate: input.hireDate,
          status: 'ACTIVE',
          probationEndDate: probationEnd,
          userId: input.userId,
          changeReason: `Nomzod ishga olindi${input.note ? `: ${input.note}` : ''}`,
        },
        clientInfo,
      );
      employeeId = employee.id;
    }

    const people = await responsibles(employeeId);
    const now = new Date();
    const checklistId = await prisma.$transaction(async (tx) => {
      const claimed = await tx.candidate.updateMany({ where: { id, stage: row.stage }, data: { stage: 'HIRED', decidedById: actor.id, decidedAt: now, decisionNote: input.note ?? null, employeeId } });
      if (claimed.count === 0) throw AppError.conflict('Nomzod hozirgina o‘zgartirildi — sahifani yangilang');
      await tx.candidateEvent.create({ data: { candidateId: id, fromStage: row.stage, toStage: 'HIRED', note: input.note ?? null, actorId: actor.id } });
      const created = await openChecklist(
        tx,
        actor,
        {
          kind: 'ONBOARDING',
          employeeId,
          userId: input.userId ?? null,
          subjectName: `${row.firstName} ${row.lastName}`.trim(),
          reason: null,
          lastWorkingDay: null,
          dueDate: addDays(input.hireDate, 14),
          branchId: resolveBranchId(access),
        },
        people,
        clientInfo,
      );
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'candidate.hired', entityType: 'candidate', entityId: id, metadata: { employeeId, probationEndDate: probationEnd ? toDateOnly(probationEnd) : null, checklistId: created }, ...clientInfo });
      return created;
    });
    return { ...(await this.candidate(actor, id)), checklistId };
  },

  // ------------------------------------------------------------ onboarding / offboarding
  async checklists(actor: AuthUser, query: { kind?: HrChecklistKind | undefined; status?: HrChecklistStatus | undefined }): Promise<ChecklistDto[]> {
    const access = await getBranchAccess(actor);
    const rows = await prisma.hrChecklist.findMany({
      where: { ...branchFilter(access), ...(query.kind ? { kind: query.kind } : {}), ...(query.status ? { status: query.status } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: checklistSelect,
    });
    // Ro'yxatda tizim bandlari hisoblanmaydi (tezlik uchun) — faqat qo'lda belgilanganlar; tafsilotda to'liq
    return rows.map((row) => toChecklistDto(row, null));
  },

  async checklist(actor: AuthUser, id: string): Promise<ChecklistDetailDto> {
    const access = await getBranchAccess(actor);
    const row = await findChecklist(access, id);
    const facts = await systemFacts(row);
    return { ...toChecklistDto(row, facts), facts };
  },

  async createChecklist(actor: AuthUser, input: ChecklistCreateInput, clientInfo: ClientInfo): Promise<ChecklistDetailDto> {
    const access = await getBranchAccess(actor);
    let subject: { employeeId: string | null; userId: string | null; name: string };
    if (input.employeeId) {
      const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, ...branchFilter(access) }, select: { id: true, userId: true, firstName: true, lastName: true } });
      if (!employee) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'employeeId', message: 'Xodim topilmadi' }]);
      subject = { employeeId: employee.id, userId: employee.userId, name: fullName(employee) };
    } else {
      const user = await prisma.user.findFirst({ where: { id: input.userId!, deletedAt: null, role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) }, select: { id: true, firstName: true, lastName: true } });
      if (!user) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'userId', message: 'Xodim topilmadi' }]);
      subject = { employeeId: null, userId: user.id, name: fullName(user) };
    }
    const open = await prisma.hrChecklist.count({
      where: { kind: input.kind, status: 'OPEN', OR: [...(subject.employeeId ? [{ employeeId: subject.employeeId }] : []), ...(subject.userId ? [{ userId: subject.userId }] : [])] },
    });
    if (open > 0) throw AppError.conflict(input.kind === 'ONBOARDING' ? 'Bu xodim uchun ochiq onboarding bor' : 'Bu xodim uchun ochiq offboarding bor');
    const people = await responsibles(subject.employeeId);
    const id = await prisma.$transaction((tx) =>
      openChecklist(
        tx,
        actor,
        {
          kind: input.kind,
          employeeId: subject.employeeId,
          userId: subject.userId,
          subjectName: subject.name,
          reason: input.kind === 'OFFBOARDING' ? (input.reason ?? null) : null,
          lastWorkingDay: input.kind === 'OFFBOARDING' ? (input.lastWorkingDay ?? null) : null,
          dueDate: input.dueDate ?? null,
          branchId: resolveBranchId(access),
        },
        people,
        clientInfo,
      ),
    );
    return this.checklist(actor, id);
  },

  /** Oddiy bandni belgilash: ro'yxat boshqaruvchisi yoki bandning mas'uli. Tizim bandi — CRM ma'lumotidan, qo'lda emas */
  async setItem(actor: AuthUser, id: string, itemId: string, input: ChecklistItemInput, clientInfo: ClientInfo): Promise<ChecklistDetailDto> {
    const access = await getBranchAccess(actor);
    const row = await findChecklist(access, id);
    if (row.status !== 'OPEN') throw AppError.unprocessable('Ro‘yxat yopilgan');
    const item = row.items.find((entry) => entry.id === itemId);
    if (!item) throw AppError.notFound('Band topilmadi');
    if (item.key && SYSTEM_KEYS.has(item.key) && !(row.kind === 'ONBOARDING' && item.key === 'access')) {
      throw AppError.unprocessable('Bu band CRM ma’lumotidan avtomatik tekshiriladi — tegishli amalni bajaring');
    }
    const manager = (await permissionsOf(actor)).has(PERMISSIONS.EMPLOYEE_MANAGE);
    if (!manager && item.responsible?.id !== actor.id) throw AppError.forbidden('Bu bandni faqat uning mas’uli yoki rahbar belgilaydi');
    await prisma.$transaction(async (tx) => {
      await tx.hrChecklistItem.update({ where: { id: itemId }, data: input.done ? { doneAt: new Date(), doneById: actor.id, note: input.note ?? null } : { doneAt: null, doneById: null, note: input.note ?? null } });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'checklist.item_updated', entityType: 'hr_checklist', entityId: id, metadata: { item: item.title, done: input.done, note: input.note ?? null }, ...clientInfo });
    });
    return this.checklist(actor, id);
  },

  /** Offboarding: ochiq vazifa, follow-up va murojaatlarni boshqa xodimga topshirish (tarix bilan) */
  async handover(actor: AuthUser, id: string, assigneeId: string, clientInfo: ClientInfo): Promise<ChecklistDetailDto> {
    const access = await getBranchAccess(actor);
    const row = await findChecklist(access, id);
    if (row.kind !== 'OFFBOARDING' || row.status !== 'OPEN') throw AppError.unprocessable('Faqat ochiq offboarding ro‘yxatida');
    if (!row.userId) throw AppError.unprocessable('Xodimning CRM hisobi yo‘q — topshiriladigan ish yo‘q');
    if (assigneeId === row.userId) throw AppError.unprocessable('Ish xodimning o‘ziga topshirilmaydi');
    const assignee = await prisma.user.findFirst({ where: { id: assigneeId, deletedAt: null, status: 'ACTIVE', role: staffRoleWhere, ...(access.canViewAll ? {} : { branchId: access.branchId }) }, select: { id: true, firstName: true, lastName: true } });
    if (!assignee) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'assigneeId', message: 'Xodim topilmadi' }]);
    const from = row.userId;
    const note = `Offboarding: ${row.subjectName} ishlari topshirildi`;
    await prisma.$transaction(async (tx) => {
      const tasks = await tx.task.findMany({ where: { assigneeId: from, status: { in: [...ACTIVE_TASK_STATUSES] } }, select: { id: true } });
      if (tasks.length > 0) {
        await tx.task.updateMany({ where: { id: { in: tasks.map((task) => task.id) } }, data: { assigneeId: assignee.id, escalatedAt: null } });
        await tx.taskAssignment.createMany({ data: tasks.map((task) => ({ taskId: task.id, fromUserId: from, toUserId: assignee.id, changedById: actor.id, note })) });
      }
      const followUps = await tx.followUp.updateMany({ where: { assignedToId: from, status: 'PENDING' }, data: { assignedToId: assignee.id } });
      const complaints = await tx.complaint.findMany({ where: { assigneeId: from, status: { in: ['NEW', 'UNDER_REVIEW'] } }, select: { id: true } });
      if (complaints.length > 0) {
        await tx.complaint.updateMany({ where: { id: { in: complaints.map((complaint) => complaint.id) } }, data: { assigneeId: assignee.id } });
        await tx.complaintEvent.createMany({ data: complaints.map((complaint) => ({ complaintId: complaint.id, type: 'ASSIGNED' as const, note, actorId: actor.id })) });
      }
      const total = tasks.length + followUps.count + complaints.length;
      if (total > 0 && assignee.id !== actor.id) {
        await notificationService.createInTransaction(tx, {
          userId: assignee.id,
          type: 'HR_UPDATE',
          title: 'Sizga ishlar topshirildi',
          message: `${row.subjectName}: ${tasks.length} vazifa, ${followUps.count} follow-up, ${complaints.length} murojaat`,
          entityType: 'hr_checklist',
          entityId: id,
          actionUrl: '/my-work',
          dedupeKey: `checklist:${id}:handover:${assignee.id}:${Date.now()}`,
        });
      }
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'offboarding.handover', entityType: 'hr_checklist', entityId: id, metadata: { from, to: assignee.id, tasks: tasks.length, followUps: followUps.count, complaints: complaints.length }, ...clientInfo });
    });
    return this.checklist(actor, id);
  },

  /** Offboarding: CRM kirishini bekor qilish — hisob bloklanadi, sessiyalar yopiladi (Telegram bot ham faol hisobni talab qiladi) */
  async revokeAccess(actor: AuthUser, id: string, clientInfo: ClientInfo): Promise<ChecklistDetailDto> {
    const access = await getBranchAccess(actor);
    const row = await findChecklist(access, id);
    if (row.kind !== 'OFFBOARDING' || row.status !== 'OPEN') throw AppError.unprocessable('Faqat ochiq offboarding ro‘yxatida');
    if (!row.userId) throw AppError.unprocessable('Xodimning CRM hisobi yo‘q');
    if (!(await permissionsOf(actor)).has(PERMISSIONS.USER_MANAGE)) throw AppError.forbidden('Kirish huquqini bekor qilish uchun foydalanuvchilarni boshqarish huquqi kerak');
    // Foydalanuvchilar servisi o'z tekshiruvlarini qiladi (o'zini bloklamaslik, oxirgi Super Admin) va auditga yozadi
    await userService.setStatus(actor, row.userId, { status: 'BLOCKED' }, clientInfo);
    return this.checklist(actor, id);
  },

  /**
   * Yopish: barcha bandlar bajarilgan bo'lishi shart. Offboardingda xodim kartasi "ishdan ketgan" bo'ladi
   * (oxirgi ish kuni bilan, ish tarixiga yoziladi).
   */
  async complete(actor: AuthUser, id: string, clientInfo: ClientInfo): Promise<ChecklistDetailDto> {
    const detail = await this.checklist(actor, id);
    if (detail.status !== 'OPEN') throw AppError.unprocessable('Ro‘yxat allaqachon yopilgan');
    const pending = detail.items.filter((item) => !item.done);
    if (pending.length > 0) throw AppError.unprocessable(`Bajarilmagan bandlar bor: ${pending.map((item) => item.title).join('; ')}`);
    if (detail.kind === 'OFFBOARDING' && detail.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: detail.employeeId }, select: { status: true } });
      if (employee && employee.status !== 'RESIGNED') {
        await employeeService.update(
          actor,
          detail.employeeId,
          { status: 'RESIGNED', terminationDate: detail.lastWorkingDay ? new Date(`${detail.lastWorkingDay}T00:00:00.000Z`) : new Date(`${businessDateString(new Date())}T00:00:00.000Z`), changeReason: detail.reason ?? 'Offboarding yakunlandi' },
          clientInfo,
        );
      }
    }
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.hrChecklist.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'COMPLETED', completedAt: new Date(), completedById: actor.id } });
      if (claimed.count === 0) throw AppError.conflict('Ro‘yxat hozirgina o‘zgartirildi');
      await auditService.recordInTransaction(tx, { userId: actor.id, action: detail.kind === 'ONBOARDING' ? 'onboarding.completed' : 'offboarding.completed', entityType: 'hr_checklist', entityId: id, metadata: { subject: detail.subjectName }, ...clientInfo });
    });
    return this.checklist(actor, id);
  },

  async cancel(actor: AuthUser, id: string, note: string, clientInfo: ClientInfo): Promise<ChecklistDetailDto> {
    const access = await getBranchAccess(actor);
    const row = await findChecklist(access, id);
    if (row.status !== 'OPEN') throw AppError.unprocessable('Ro‘yxat allaqachon yopilgan');
    await prisma.$transaction(async (tx) => {
      await tx.hrChecklist.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date(), completedById: actor.id } });
      await auditService.recordInTransaction(tx, { userId: actor.id, action: 'checklist.cancelled', entityType: 'hr_checklist', entityId: id, metadata: { subject: row.subjectName, kind: row.kind, note }, ...clientInfo });
    });
    return this.checklist(actor, id);
  },
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
