import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { WeekDay } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { addDays, businessDateString, dateColumn, startOfBusinessDay } from '../utils/dates.js';
import { getBranchAccess } from './branchAccess.js';
import { NEGATIVE_RATING, NPS_DETRACTOR_MAX } from './feedback.service.js';
import { permissionService } from './permission.service.js';

/**
 * "Ishlarim" markazi (CRM 4.0, 2-faza): xodimning **o'zi qilishi kerak bo'lgan** ishlari bitta joyda.
 *
 * Har bo'lim alohida ruxsat bilan ochiladi va faqat shu xodimga tegishlisini ko'rsatadi:
 * unga biriktirilgan vazifa va follow-up, u tasdiqlashi mumkin bo'lgan so'rovlar, o'z guruhlarining
 * baholanmagan ishlari va bugungi belgilanmagan darslari. Bu — boshqaruv hisoboti emas (uni rahbar paneli beradi).
 * Har bo'limda son to'liq, ro'yxat esa eng muhim bir nechtasi; qolgani bo'lim sahifasida.
 */
const PREVIEW = 5;
const DAY_NAMES: readonly WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export type MyWorkSectionKey = 'tasks' | 'followUps' | 'approvals' | 'alerts' | 'homework' | 'examReviews' | 'attendance' | 'feedback';

export interface MyWorkItem {
  id: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  overdue: boolean;
  link: string | null;
}

export interface MyWorkSection {
  key: MyWorkSectionKey;
  title: string;
  /** Jami kutilayotgan ishlar soni */
  count: number;
  /** Shulardan muddati o'tgani */
  overdue: number;
  /** Bo'limning to'liq sahifasi */
  link: string;
  items: MyWorkItem[];
}

export interface MyWorkDto {
  total: number;
  overdue: number;
  sections: MyWorkSection[];
}

function name(person: { firstName: string; lastName: string | null }): string {
  return `${person.firstName} ${person.lastName ?? ''}`.trim();
}

export const myWorkService = {
  async get(actor: AuthUser, now: Date = new Date()): Promise<MyWorkDto> {
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const access = await getBranchAccess(actor);
    const branch = access.canViewAll ? {} : { branchId: access.branchId };
    const endOfToday = addDays(startOfBusinessDay(now), 1);
    const sections: Array<Promise<MyWorkSection>> = [];

    // 1. Vazifalar — har bir xodimda
    sections.push(
      (async () => {
        const where = { assigneeId: actor.id, status: 'OPEN' as const };
        const [count, overdue, rows] = await Promise.all([
          prisma.task.count({ where }),
          prisma.task.count({ where: { ...where, dueAt: { lt: now } } }),
          prisma.task.findMany({
            where,
            orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
            take: PREVIEW,
            select: { id: true, title: true, dueAt: true, link: true, priority: true, createdBy: { select: { firstName: true, lastName: true } } },
          }),
        ]);
        return {
          key: 'tasks',
          title: 'Vazifalar',
          count,
          overdue,
          link: '/tasks',
          items: rows.map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: row.createdBy ? `Berdi: ${name(row.createdBy)}` : null,
            dueAt: row.dueAt?.toISOString() ?? null,
            overdue: row.dueAt !== null && row.dueAt < now,
            link: row.link,
          })),
        };
      })(),
    );

    // 2. Follow-up: bugungacha muddati kelganlar
    if (permissions.has(PERMISSIONS.FOLLOWUP_VIEW)) {
      sections.push(
        (async () => {
          const where = { assignedToId: actor.id, status: 'PENDING' as const, dueAt: { lt: endOfToday }, lead: { deletedAt: null } };
          const [count, overdue, rows] = await Promise.all([
            prisma.followUp.count({ where }),
            prisma.followUp.count({ where: { ...where, dueAt: { lt: now } } }),
            prisma.followUp.findMany({
              where,
              orderBy: { dueAt: 'asc' },
              take: PREVIEW,
              select: { id: true, title: true, dueAt: true, lead: { select: { id: true, firstName: true, lastName: true } } },
            }),
          ]);
          return {
            key: 'followUps',
            title: 'Follow-up',
            count,
            overdue,
            link: '/follow-ups',
            items: rows.map((row) => ({ id: row.id, title: row.title, subtitle: name(row.lead), dueAt: row.dueAt.toISOString(), overdue: row.dueAt < now, link: `/leads/${row.lead.id}` })),
          };
        })(),
      );
    }

    // 3. Tasdiqlar — tasdiqlash huquqi borlarga
    if (permissions.has(PERMISSIONS.EXPENSE_APPROVE)) {
      sections.push(
        (async () => {
          const where = { status: 'PENDING' as const, type: 'EXPENSE' as const, ...branch };
          const [count, rows] = await Promise.all([
            prisma.approvalRequest.count({ where }),
            prisma.approvalRequest.findMany({
              where,
              orderBy: { createdAt: 'asc' },
              take: PREVIEW,
              select: { id: true, title: true, link: true, createdAt: true, requestedBy: { select: { firstName: true, lastName: true } } },
            }),
          ]);
          return {
            key: 'approvals',
            title: 'Tasdiq kutayotganlar',
            count,
            overdue: 0,
            link: '/expenses',
            items: rows.map((row) => ({ id: row.id, title: row.title, subtitle: row.requestedBy ? `So‘radi: ${name(row.requestedBy)}` : null, dueAt: null, overdue: false, link: row.link })),
          };
        })(),
      );
    }

    // 4. Menga biriktirilgan ogohlantirishlar
    if (permissions.has(PERMISSIONS.ALERT_VIEW)) {
      sections.push(
        (async () => {
          const where = { assigneeId: actor.id, resolvedAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
          const [count, rows] = await Promise.all([
            prisma.alert.count({ where }),
            prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, take: PREVIEW, select: { id: true, title: true, message: true } }),
          ]);
          return {
            key: 'alerts',
            title: 'Menga biriktirilgan ogohlantirishlar',
            count,
            overdue: 0,
            link: '/alerts',
            items: rows.map((row) => ({ id: row.id, title: row.title, subtitle: row.message.slice(0, 160), dueAt: null, overdue: false, link: '/alerts' })),
          };
        })(),
      );
    }

    // 5. Baholanmagan uy vazifalari — o'zi bergan vazifalar bo'yicha
    if (permissions.has(PERMISSIONS.HOMEWORK_GRADE)) {
      sections.push(
        (async () => {
          const where = { status: { in: ['SUBMITTED' as const, 'LATE' as const] }, score: null, homework: { teacherId: actor.id, status: { not: 'DRAFT' as const } } };
          const [count, rows] = await Promise.all([
            prisma.homeworkSubmission.count({ where }),
            prisma.homeworkSubmission.groupBy({ by: ['homeworkId'], where, _count: { _all: true }, orderBy: { _count: { homeworkId: 'desc' } }, take: PREVIEW }),
          ]);
          const homework = await prisma.homework.findMany({ where: { id: { in: rows.map((row) => row.homeworkId) } }, select: { id: true, title: true, group: { select: { name: true } } } });
          const byId = new Map(homework.map((row) => [row.id, row]));
          return {
            key: 'homework',
            title: 'Baholanmagan uy vazifalari',
            count,
            overdue: 0,
            link: '/homework',
            items: rows.map((row) => ({
              id: row.homeworkId,
              title: byId.get(row.homeworkId)?.title ?? 'Uy vazifasi',
              subtitle: `${byId.get(row.homeworkId)?.group.name ?? ''} · ${row._count._all} ta ish`.replace(/^ · /, ''),
              dueAt: null,
              overdue: false,
              link: `/homework/${row.homeworkId}`,
            })),
          };
        })(),
      );
    }

    // 6. Tekshirilmagan imtihon urinishlari — o'z guruhlari bo'yicha
    if (permissions.has(PERMISSIONS.EXAM_GRADE)) {
      sections.push(
        (async () => {
          const where = { status: 'NEEDS_REVIEW' as const, exam: { OR: [{ teacherId: actor.id }, { group: { teacherId: actor.id } }] } };
          const [count, rows] = await Promise.all([
            prisma.examAttempt.count({ where }),
            prisma.examAttempt.findMany({
              where,
              orderBy: { startedAt: 'asc' },
              take: PREVIEW,
              select: { id: true, exam: { select: { id: true, title: true } }, student: { select: { firstName: true, lastName: true } } },
            }),
          ]);
          return {
            key: 'examReviews',
            title: 'Tekshirilmagan imtihon javoblari',
            count,
            overdue: 0,
            link: '/teaching',
            items: rows.map((row) => ({ id: row.id, title: row.exam.title, subtitle: name(row.student), dueAt: null, overdue: false, link: '/teaching' })),
          };
        })(),
      );
    }

    // 7. Bugun darsi bor, davomati belgilanmagan o'z guruhlari
    if (permissions.has(PERMISSIONS.ATTENDANCE_MARK)) {
      sections.push(
        (async () => {
          const today = dateColumn(now);
          const weekday = DAY_NAMES[new Date(`${businessDateString(now)}T00:00:00Z`).getUTCDay()]!;
          const groups = await prisma.group.findMany({
            where: { teacherId: actor.id, status: 'ACTIVE', scheduleDays: { has: weekday }, attendances: { none: { date: today } }, students: { some: { deletedAt: null, status: 'ACTIVE' } } },
            orderBy: { startTime: 'asc' },
            select: { id: true, name: true, startTime: true },
          });
          return {
            key: 'attendance',
            title: 'Bugungi belgilanmagan darslar',
            count: groups.length,
            overdue: 0,
            link: '/attendance',
            items: groups.slice(0, PREVIEW).map((group) => ({ id: group.id, title: group.name, subtitle: `Dars vaqti: ${group.startTime}`, dueAt: null, overdue: false, link: `/teaching/groups/${group.id}` })),
          };
        })(),
      );
    }

    // 8. Ko'rib chiqilmagan salbiy fikrlar — ular bilan ishlash huquqi borlarga
    if (permissions.has(PERMISSIONS.FEEDBACK_MANAGE)) {
      sections.push(
        (async () => {
          const where = {
            ...branch,
            handledAt: null,
            OR: [
              { type: { not: 'NPS' as const }, rating: { lte: NEGATIVE_RATING } },
              { type: 'NPS' as const, npsScore: { lte: NPS_DETRACTOR_MAX } },
            ],
          };
          const [count, rows] = await Promise.all([
            prisma.feedback.count({ where }),
            prisma.feedback.findMany({ where, orderBy: { createdAt: 'asc' }, take: PREVIEW, select: { id: true, comment: true, rating: true, npsScore: true, createdAt: true } }),
          ]);
          return {
            key: 'feedback',
            title: 'Ko‘rib chiqilmagan salbiy fikrlar',
            count,
            overdue: 0,
            link: '/feedback',
            items: rows.map((row) => ({
              id: row.id,
              title: row.comment?.slice(0, 120) || 'Izohsiz past baho',
              subtitle: row.npsScore !== null ? `NPS: ${row.npsScore}` : `Baho: ${row.rating ?? '—'}`,
              dueAt: null,
              overdue: false,
              link: '/feedback',
            })),
          };
        })(),
      );
    }

    const resolved = await Promise.all(sections);
    return {
      total: resolved.reduce((sum, section) => sum + section.count, 0),
      overdue: resolved.reduce((sum, section) => sum + section.overdue, 0),
      sections: resolved,
    };
  },
};
