import { attachOpenGroupHomework } from './homework.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Yangi guruhga qo‘shildi / boshqa guruhga o‘tkazildi / guruhdan chiqarildi */
export type GroupChangeKind = 'ENROLLED' | 'TRANSFERRED' | 'REMOVED';

export interface GroupChangeDto {
  id: string;
  kind: GroupChangeKind;
  /** Nom o‘sha paytdagi holatda; guruh o‘chirilgan bo‘lsa id null */
  from: { id: string | null; name: string } | null;
  to: { id: string | null; name: string } | null;
  reason: string | null;
  changedAt: string;
  changedBy: { id: string; firstName: string; lastName: string } | null;
  /** Oldingi guruhda o‘tkazgan kunlari (tarixda shu guruhga qo‘shilgan yozuv bo‘lsa) */
  daysInPreviousGroup: number | null;
}

export const groupChangeSelect = {
  id: true,
  fromGroupId: true,
  toGroupId: true,
  fromGroupName: true,
  toGroupName: true,
  reason: true,
  changedAt: true,
  changedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.StudentGroupChangeSelect;

type GroupChangeRecord = Prisma.StudentGroupChangeGetPayload<{ select: typeof groupChangeSelect }>;

const DAY_MS = 86_400_000;

function side(id: string | null, name: string | null): { id: string | null; name: string } | null {
  return id || name ? { id, name: name ?? '—' } : null;
}

/** Guruh o‘zgarishini tarixga yozadi; guruh o‘zgarmagan bo‘lsa hech narsa qilmaydi */
export async function recordGroupChange(
  tx: Prisma.TransactionClient,
  input: { studentId: string; fromGroupId: string | null; toGroupId: string | null; reason?: string | null; changedById: string | null },
): Promise<boolean> {
  if (input.fromGroupId === input.toGroupId) return false;
  const ids = [input.fromGroupId, input.toGroupId].filter((id): id is string => Boolean(id));
  const groups = ids.length > 0 ? await tx.group.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf = (id: string | null) => (id ? (groups.find((group) => group.id === id)?.name ?? null) : null);

  await tx.studentGroupChange.create({
    data: {
      studentId: input.studentId,
      fromGroupId: input.fromGroupId,
      toGroupId: input.toGroupId,
      fromGroupName: nameOf(input.fromGroupId),
      toGroupName: nameOf(input.toGroupId),
      reason: input.reason ?? null,
      changedById: input.changedById,
    },
  });
  // Yangi guruhning ochiq (butun guruhga berilgan, muddati o'tmagan) vazifalari o'quvchiga ham ochiladi
  if (input.toGroupId) await attachOpenGroupHomework(tx, input.studentId, input.toGroupId);
  return true;
}

/** Eng yangisi birinchi; oldingi guruhda o‘tkazilgan kunlar ketma-ket yozuvlardan hisoblanadi */
export function toGroupChangeDtos(rows: GroupChangeRecord[]): GroupChangeDto[] {
  const ordered = [...rows].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  return ordered
    .map((row, index): GroupChangeDto => {
      const from = side(row.fromGroupId, row.fromGroupName);
      const to = side(row.toGroupId, row.toGroupName);
      const previous = index > 0 ? ordered[index - 1] : undefined;
      const continues =
        from !== null &&
        previous !== undefined &&
        (row.fromGroupId ? previous.toGroupId === row.fromGroupId : previous.toGroupName === row.fromGroupName);

      return {
        id: row.id,
        kind: from === null ? 'ENROLLED' : to === null ? 'REMOVED' : 'TRANSFERRED',
        from,
        to,
        reason: row.reason,
        changedAt: row.changedAt.toISOString(),
        changedBy: row.changedBy,
        daysInPreviousGroup:
          continues && previous ? Math.max(Math.floor((row.changedAt.getTime() - previous.changedAt.getTime()) / DAY_MS), 0) : null,
      };
    })
    .reverse();
}
