import { prisma } from '../config/database.js';
import { assertTopicForGroup, startTopicForAttendees } from './curriculum.service.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { AttendanceSessionStatus, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  CreateSessionInput,
  SessionListQuery,
  UpdateSessionInput,
} from '../validators/attendanceSession.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';
import { masteryService } from './mastery.service.js';
import { isRosterLimited } from './teachingAccess.js';

const sessionSelect = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  topic: true,
  note: true,
  status: true,
  createdAt: true,
  curriculumTopic: { select: { id: true, title: true } },
  group: { select: { id: true, name: true, course: { select: { id: true, name: true } } } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { attendances: true } },
} satisfies Prisma.AttendanceSessionSelect;

type SessionRecord = Prisma.AttendanceSessionGetPayload<{ select: typeof sessionSelect }>;

export interface AttendanceSessionDto {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  /** Kurs dasturidagi mavzu (LMS) */
  curriculumTopic: { id: string; title: string } | null;
  note: string | null;
  status: AttendanceSessionStatus;
  markedCount: number;
  createdAt: string;
  group: { id: string; name: string; course: { id: string; name: string } };
  teacher: { id: string; firstName: string; lastName: string } | null;
}

export interface SessionAccess {
  userId: string;
  canManageGroups: boolean;
  /** O‘qituvchi faqat o‘z guruhlari seanslarini ko‘radi va boshqaradi */
  onlyOwnGroups: boolean;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDto(session: SessionRecord): AttendanceSessionDto {
  return {
    id: session.id,
    date: toDateOnly(session.date),
    startTime: session.startTime,
    endTime: session.endTime,
    topic: session.topic,
    curriculumTopic: session.curriculumTopic,
    note: session.note,
    status: session.status,
    markedCount: session._count.attendances,
    createdAt: session.createdAt.toISOString(),
    group: session.group,
    teacher: session.teacher,
  };
}

/** Seansga mavzu biriktirildi — allaqachon belgilangan kelganlar progressi yangilanadi */
async function applyTopicToAttendees(sessionId: string, topicId: string, actorId: string): Promise<void> {
  const marked = await prisma.attendance.findMany({ where: { sessionId }, select: { studentId: true, status: true } });
  if (marked.length === 0) return;
  const attendees = marked.filter((row) => row.status === 'PRESENT' || row.status === 'LATE');
  if (attendees.length > 0) {
    await prisma.$transaction((tx) => startTopicForAttendees(tx, { topicId, studentIds: attendees.map((row) => row.studentId), markedById: actorId }));
  }
  // Davomat endi shu mavzu hisobiga o'tadi — barcha belgilanganlar o'zlashtirishi yangilanadi
  await masteryService.refresh(marked.map((row) => row.studentId));
}

export async function getSessionAccess(actor: AuthUser): Promise<SessionAccess> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  const canManageGroups = permissions.has(PERMISSIONS.GROUP_MANAGE);
  return {
    userId: actor.id,
    canManageGroups,
    onlyOwnGroups: isRosterLimited(permissions, PERMISSIONS.GROUP_MANAGE),
  };
}

/** "2026-10-01" → o‘sha kun (UTC yarim tuni, @db.Date bilan mos) */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function findVisibleSession(access: SessionAccess, id: string): Promise<SessionRecord> {
  const session = await prisma.attendanceSession.findFirst({
    where: { id, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    select: sessionSelect,
  });
  if (!session) {
    throw AppError.notFound('Dars seansi topilmadi');
  }
  return session;
}

async function assertGroupVisible(access: SessionAccess, groupId: string): Promise<{ id: string; teacherId: string | null; name: string }> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, teacherId: true, name: true } });
  if (!group || (access.onlyOwnGroups && group.teacherId !== access.userId)) {
    throw AppError.notFound('Guruh topilmadi');
  }
  return group;
}

export const attendanceSessionService = {
  async list(actor: AuthUser, query: SessionListQuery): Promise<AttendanceSessionDto[]> {
    const access = await getSessionAccess(actor);
    const where: Prisma.AttendanceSessionWhereInput = {
      ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: parseDateOnly(query.from) } : {}),
              ...(query.to ? { lte: parseDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    const sessions = await prisma.attendanceSession.findMany({
      where,
      select: sessionSelect,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: query.limit,
    });
    return sessions.map(toDto);
  },

  async getById(actor: AuthUser, id: string): Promise<AttendanceSessionDto> {
    const access = await getSessionAccess(actor);
    return toDto(await findVisibleSession(access, id));
  },

  /**
   * Dars seansini ochadi. Bir guruh uchun bir kunda bitta seans bo‘ladi —
   * mavjud bo‘lsa, yangi yaratilmaydi (mavzu va vaqt yangilanadi).
   */
  async create(actor: AuthUser, input: CreateSessionInput, client: ClientInfo): Promise<AttendanceSessionDto> {
    const access = await getSessionAccess(actor);
    const group = await assertGroupVisible(access, input.groupId);
    if (input.topicId) await assertTopicForGroup(input.topicId, input.groupId);

    const existing = await prisma.attendanceSession.findUnique({
      where: { groupId_date: { groupId: input.groupId, date: input.date } },
      select: { id: true },
    });

    const data = {
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      topic: input.topic ?? null,
      ...(input.topicId === undefined ? {} : { topicId: input.topicId }),
      note: input.note ?? null,
      status: input.status,
    };

    const session = existing
      ? await prisma.attendanceSession.update({ where: { id: existing.id }, data, select: sessionSelect })
      : await prisma.attendanceSession.create({
          data: {
            groupId: input.groupId,
            teacherId: group.teacherId,
            date: input.date,
            markedById: actor.id,
            ...data,
          },
          select: sessionSelect,
        });

    if (input.topicId && session.status === 'HELD') await applyTopicToAttendees(session.id, input.topicId, actor.id);

    await auditService.record({
      userId: actor.id,
      action: existing ? 'attendance_session.updated' : 'attendance_session.created',
      entityType: 'attendanceSession',
      entityId: session.id,
      metadata: { group: group.name, date: toDateOnly(input.date), status: input.status },
      ...client,
    });

    return toDto(session);
  },

  async update(actor: AuthUser, id: string, input: UpdateSessionInput, client: ClientInfo): Promise<AttendanceSessionDto> {
    const access = await getSessionAccess(actor);
    const session = await findVisibleSession(access, id);
    if (input.topicId) await assertTopicForGroup(input.topicId, session.group.id);

    const updated = await prisma.attendanceSession.update({
      where: { id },
      data: {
        ...(input.topicId === undefined ? {} : { topicId: input.topicId }),
        ...(input.startTime === undefined ? {} : { startTime: input.startTime ?? null }),
        ...(input.endTime === undefined ? {} : { endTime: input.endTime ?? null }),
        ...(input.topic === undefined ? {} : { topic: input.topic ?? null }),
        ...(input.note === undefined ? {} : { note: input.note ?? null }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      select: sessionSelect,
    });

    if (input.topicId && updated.status === 'HELD') await applyTopicToAttendees(id, input.topicId, actor.id);

    await auditService.record({
      userId: actor.id,
      action: 'attendance_session.updated',
      entityType: 'attendanceSession',
      entityId: id,
      metadata: { group: session.group.name, date: toDateOnly(session.date), status: updated.status },
      ...client,
    });

    return toDto(updated);
  },

  /** Seansni o‘chirish — faqat davomat belgilanmagan bo‘lsa */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getSessionAccess(actor);
    const session = await findVisibleSession(access, id);
    if (session._count.attendances > 0) {
      throw AppError.conflict('Bu seansda davomat belgilangan — avval davomatni tozalang');
    }

    await prisma.attendanceSession.delete({ where: { id } });
    await auditService.record({
      userId: actor.id,
      action: 'attendance_session.deleted',
      entityType: 'attendanceSession',
      entityId: id,
      metadata: { group: session.group.name, date: toDateOnly(session.date) },
      ...client,
    });
  },

  /**
   * Guruh va sana bo‘yicha seansni topadi yoki yaratadi.
   * Davomat belgilanganda chaqiriladi — o‘qituvchi alohida "dars ochish" qilmasligi uchun.
   */
  async ensureSession(
    tx: Prisma.TransactionClient,
    input: { groupId: string; date: Date; teacherId: string | null; markedById: string; topicId?: string | null },
  ): Promise<string> {
    const existing = await tx.attendanceSession.findUnique({
      where: { groupId_date: { groupId: input.groupId, date: input.date } },
      select: { id: true },
    });
    if (existing) {
      if (input.topicId) await tx.attendanceSession.update({ where: { id: existing.id }, data: { topicId: input.topicId } });
      return existing.id;
    }

    const created = await tx.attendanceSession.create({
      data: {
        groupId: input.groupId,
        date: input.date,
        teacherId: input.teacherId,
        markedById: input.markedById,
        status: 'HELD',
        topicId: input.topicId ?? null,
      },
      select: { id: true },
    });
    return created.id;
  },
};
