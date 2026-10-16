import type { Prisma } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient;

/**
 * O'quvchi bir nechta guruhda (masalan, PMT: Matematika + Ingliz tili):
 * - **asosiy guruh** — `Student.groupId`: to'lov, o'qituvchi foizi, hisobotlar shunga bog'langan (o'zgarmagan);
 * - **qo'shimcha guruhlar** — `StudentGroupMembership` (faol: `leftAt = null`): faqat o'quv jarayoni.
 *
 * "Guruhdagi o'quvchi" va "o'qituvchining o'quvchisi" shartlari shu faylda — ro'yxat, davomat, vazifa,
 * imtihon, kabinet va kirish tekshiruvlari bir xil qoidadan foydalanadi. Moliya va hisobotlar ataylab
 * asosiy guruh bo'yicha qoladi: bitta o'quvchining summasi ikki guruhda ikki marta sanalmaydi.
 */

/** Faol qo'shimcha a'zolik sharti */
export const ACTIVE_MEMBERSHIP = { leftAt: null } as const;

/** O'quvchi shu guruhda: asosiy yoki faol qo'shimcha */
export function studentInGroup(groupId: string): Prisma.StudentWhereInput {
  return { OR: [{ groupId }, { groupMemberships: { some: { groupId, ...ACTIVE_MEMBERSHIP } } }] };
}

/** O'quvchi shu guruhlardan birida */
export function studentInGroups(groupIds: string[]): Prisma.StudentWhereInput {
  return { OR: [{ groupId: { in: groupIds } }, { groupMemberships: { some: { groupId: { in: groupIds }, ...ACTIVE_MEMBERSHIP } } }] };
}

/** O'quvchi shu o'qituvchining guruhlaridan birida (asosiy yoki qo'shimcha) */
export function studentTaughtBy(teacherId: string): Prisma.StudentWhereInput {
  return {
    OR: [{ group: { teacherId } }, { groupMemberships: { some: { ...ACTIVE_MEMBERSHIP, group: { teacherId } } } }],
  };
}

/** O'quvchining barcha joriy guruhlari: asosiy birinchi, keyin qo'shimchalar */
export async function studentGroupIds(db: Db, studentId: string): Promise<string[]> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { groupId: true, groupMemberships: { where: ACTIVE_MEMBERSHIP, orderBy: { joinedAt: 'asc' }, select: { groupId: true } } },
  });
  if (!student) return [];
  return [...new Set([...(student.groupId ? [student.groupId] : []), ...student.groupMemberships.map((row) => row.groupId)])];
}

/** Guruhdagi band o'rinlar: asosiy o'quvchilar + faol qo'shimcha a'zolar (o'chirilmagan o'quvchilar) */
export async function groupOccupancy(db: Db, groupId: string): Promise<number> {
  const [primary, extra] = await Promise.all([
    db.student.count({ where: { groupId, deletedAt: null } }),
    db.studentGroupMembership.count({ where: { groupId, ...ACTIVE_MEMBERSHIP, student: { deletedAt: null } } }),
  ]);
  return primary + extra;
}

/** Bir nechta guruh uchun qo'shimcha a'zolar soni (ro'yxatlardagi sig'im uchun) */
export async function extraMemberCounts(db: Db, groupIds: string[], studentWhere: Prisma.StudentWhereInput = { deletedAt: null }): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await db.studentGroupMembership.groupBy({
    by: ['groupId'],
    where: { groupId: { in: groupIds }, ...ACTIVE_MEMBERSHIP, student: studentWhere },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.groupId, row._count._all]));
}
