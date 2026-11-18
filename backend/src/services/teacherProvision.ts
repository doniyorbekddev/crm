import type { Prisma } from '../generated/prisma/client.js';
import { businessDateString } from '../utils/dates.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { TEACHER_POSITION_KEY, recordEmployment } from './org/catalog.service.js';

/**
 * TEACHER roli berilgan foydalanuvchining o'qituvchi profili bo'lsin. Profilsiz o'qituvchi xodim davomati
 * (QR keldi-ketdi), maosh va guruhga biriktirishda ko'rinmaydi: foydalanuvchi "Foydalanuvchilar" sahifasida
 * yaratilsa yoki roli TEACHER ga o'zgartirilsa, profil "O'qituvchilar" sahifasidagidek (ishga olindi yozuvi
 * bilan) shu tranzaksiyada ochiladi. Profil bor bo'lsa — hech narsa qilinmaydi. Natija: yangi profil id si yoki null.
 */
export async function ensureTeacherProfile(
  tx: Prisma.TransactionClient,
  input: { userId: string; actorId: string | null; client?: ClientInfo | undefined; reason: string },
): Promise<string | null> {
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { firstName: true, lastName: true, teacherProfile: { select: { id: true } } } });
  if (!user || user.teacherProfile) return null;
  const today = new Date(`${businessDateString(new Date())}T00:00:00.000Z`);
  const created = await tx.teacherProfile.create({ data: { userId: input.userId, hireDate: today }, select: { id: true } });
  await recordEmployment(tx, {
    userId: input.userId,
    type: 'HIRED',
    positionKey: TEACHER_POSITION_KEY,
    positionTitle: 'O‘qituvchi',
    department: 'O‘quv bo‘limi',
    effectiveDate: today,
    createdById: input.actorId,
  });
  await auditService.recordInTransaction(tx, {
    userId: input.actorId,
    action: 'teacher.profile_created',
    entityType: 'teacher',
    entityId: created.id,
    metadata: { teacher: `${user.firstName} ${user.lastName}`, automatic: true, reason: input.reason },
    ip: input.client?.ip ?? null,
    userAgent: input.client?.userAgent ?? null,
  });
  return created.id;
}
