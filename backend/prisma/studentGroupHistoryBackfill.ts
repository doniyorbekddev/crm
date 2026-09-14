import type { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Guruhi bor, lekin guruh tarixida hech qanday yozuvi yo‘q o‘quvchilarga boshlang‘ich yozuv
 * (hozirgi guruhi, o‘quvchi qo‘shilgan vaqt bilan). Takror ishga tushirish xavfsiz.
 */
export async function backfillGroupHistory(prisma: PrismaClient): Promise<number> {
  const students = await prisma.student.findMany({
    where: { groupId: { not: null }, groupChanges: { none: {} } },
    select: { id: true, groupId: true, createdById: true, createdAt: true, group: { select: { name: true } } },
  });
  if (students.length === 0) return 0;

  const result = await prisma.studentGroupChange.createMany({
    data: students.map((student) => ({
      studentId: student.id,
      toGroupId: student.groupId,
      toGroupName: student.group?.name ?? null,
      reason: 'Tarix yuritilishidan oldingi guruh',
      changedById: student.createdById,
      changedAt: student.createdAt,
    })),
  });
  return result.count;
}
