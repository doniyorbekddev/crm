import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { branchScopeOf } from './branchScope.js';
import { studentInGroup } from './groupMembership.js';
import { isTelegramEnabled } from './telegram.service.js';
import { PRINT_INVITE_TTL_MS, telegramLinkService, type TelegramLinkDto } from './telegramLink.service.js';

type InviteLink = { deepLink: string | null; linked: boolean; expiresAt: string | null };

export interface GroupTelegramInvitesDto {
  group: { id: string; name: string; courseName: string };
  /** Bot sozlanmagan bo'lsa havola yo'q — varaq chop etilmaydi */
  enabled: boolean;
  generatedAt: string;
  rows: Array<{
    student: { id: string; name: string; code: string };
    link: InviteLink;
    parents: Array<{ id: string; name: string; phone: string; link: InviteLink }>;
  }>;
}

function toInvite(link: TelegramLinkDto): InviteLink {
  return { deepLink: link.verifiedAt ? null : link.deepLink, linked: link.verifiedAt !== null, expiresAt: link.codeExpiresAt };
}

/**
 * Guruh uchun chop etiladigan Telegram taklifnomalari: har o'quvchi va uning ota-onasi uchun QR-kodli
 * bir martalik havola (14 kun amal qiladi). Allaqachon ulanganlar uchun kod yaratilmaydi — "ulangan" deb belgilanadi.
 * Bitta ota-ona bir nechta farzand uchun bitta havola oladi.
 */
export const telegramInviteService = {
  async forGroup(actor: AuthUser, groupId: string, client: ClientInfo, now: Date = new Date()): Promise<GroupTelegramInvitesDto> {
    const scope = await branchScopeOf(actor);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, branchId: true, course: { select: { name: true } } },
    });
    if (!group || (scope.branchId && group.branchId !== scope.branchId)) throw AppError.notFound('Guruh topilmadi');

    const students = await prisma.student.findMany({
      where: { ...studentInGroup(groupId), deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        parents: { select: { parent: { select: { id: true, firstName: true, lastName: true, phone: true } } } },
      },
    });

    const parentLinks = new Map<string, InviteLink>();
    const rows: GroupTelegramInvitesDto['rows'] = [];
    for (const student of students) {
      const link = toInvite(await telegramLinkService.ensureLink({ studentId: student.id }, now, { ttlMs: PRINT_INVITE_TTL_MS }));
      const parents: GroupTelegramInvitesDto['rows'][number]['parents'] = [];
      for (const { parent } of student.parents) {
        if (!parentLinks.has(parent.id)) {
          parentLinks.set(parent.id, toInvite(await telegramLinkService.ensureLink({ parentId: parent.id }, now, { ttlMs: PRINT_INVITE_TTL_MS })));
        }
        parents.push({ id: parent.id, name: `${parent.firstName} ${parent.lastName}`, phone: parent.phone, link: parentLinks.get(parent.id)! });
      }
      rows.push({ student: { id: student.id, name: `${student.lastName} ${student.firstName}`, code: formatStudentNumber(student.number) }, link, parents });
    }

    await auditService.record({
      userId: actor.id,
      action: 'telegram.invites_generated',
      entityType: 'group',
      entityId: group.id,
      metadata: { group: group.name, students: rows.length, parents: parentLinks.size },
      ...client,
    });

    return {
      group: { id: group.id, name: group.name, courseName: group.course.name },
      enabled: isTelegramEnabled() && rows.some((row) => row.link.deepLink !== null || row.link.linked),
      generatedAt: now.toISOString(),
      rows,
    };
  },
};
