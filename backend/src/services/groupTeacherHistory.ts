import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Guruh o'qituvchisi tarixi (`group_teacher_history`): kim qaysi davrda dars bergan.
 *
 * Qoida: guruhda ko'pi bilan bitta ochiq (`endedAt` bo'sh) yozuv bo'ladi va u `groups.teacherId` bilan bir xil.
 * O'qituvchi almashganda eski yozuv yopiladi, yangisi ochiladi — shu ish guruhni yangilagan **o'sha tranzaksiyada**
 * bajariladi, shuning uchun ikkisi hech qachon ajralib qolmaydi. Yozuvlar o'chirilmaydi.
 */

export interface GroupTeacherPeriodDto {
  id: string;
  teacher: { id: string; firstName: string; lastName: string } | null;
  startedAt: string;
  /** Bo'sh — hozirgi o'qituvchi */
  endedAt: string | null;
  changedBy: { id: string; firstName: string; lastName: string } | null;
}

/** O'qituvchi o'zgargan bo'lsa tarixni yangilaydi (o'zgarmagan bo'lsa — hech narsa qilmaydi) */
export async function recordGroupTeacherChange(
  tx: Prisma.TransactionClient,
  input: { groupId: string; fromTeacherId: string | null; toTeacherId: string | null; changedById: string; at?: Date },
): Promise<boolean> {
  if (input.fromTeacherId === input.toTeacherId) return false;
  const at = input.at ?? new Date();
  await tx.groupTeacherHistory.updateMany({ where: { groupId: input.groupId, endedAt: null }, data: { endedAt: at } });
  if (input.toTeacherId) {
    await tx.groupTeacherHistory.create({
      data: { groupId: input.groupId, teacherId: input.toTeacherId, startedAt: at, changedById: input.changedById },
    });
  }
  return true;
}

const person = { select: { id: true, firstName: true, lastName: true } } as const;

/** Guruh o'qituvchilari — yangisi birinchi */
export async function groupTeacherHistory(groupId: string): Promise<GroupTeacherPeriodDto[]> {
  const rows = await prisma.groupTeacherHistory.findMany({
    where: { groupId },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: { id: true, startedAt: true, endedAt: true, teacher: person, changedBy: person },
  });
  return rows.map((row) => ({
    id: row.id,
    teacher: row.teacher,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    changedBy: row.changedBy,
  }));
}

/**
 * Berilgan vaqtda guruh o'qituvchisi (tarixiy hisobotlar uchun). Tarix yozuvi topilmasa (masalan, tarix
 * boshlanishidan oldingi sana) — `null`; chaqiruvchi bunda hozirgi o'qituvchini ishlatishi mumkin.
 */
export async function groupTeacherAt(groupId: string, at: Date): Promise<string | null> {
  const row = await prisma.groupTeacherHistory.findFirst({
    where: { groupId, startedAt: { lte: at }, OR: [{ endedAt: null }, { endedAt: { gt: at } }] },
    orderBy: { startedAt: 'desc' },
    select: { teacherId: true },
  });
  return row?.teacherId ?? null;
}
