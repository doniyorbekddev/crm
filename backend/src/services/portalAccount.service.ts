import { randomBytes } from 'node:crypto';
import { prisma } from '../config/database.js';
import { ROLE_KEYS } from '../config/permissions.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import type { PortalAccountDto } from './portal.service.js';

/**
 * O'quvchi va ota-ona uchun kabinet hisobini ochish — **xodim tomonidan** bajariladi
 * (`portal.manage` ruxsati). Parol tizim tomonidan generatsiya qilinadi va faqat
 * yaratish javobida bir marta ko'rsatiladi; bazada faqat bcrypt hash saqlanadi.
 */

/** O'qish oson bo'lishi uchun chalkashadigan belgilar (0/O, 1/l/I) ishlatilmaydi */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  let password = '';
  for (const byte of bytes) password += ALPHABET[byte % ALPHABET.length];
  // Parol siyosati: katta harf, kichik harf va raqam bo'lishi shart
  return `${password.slice(0, length - 3)}Aa${(bytes[0]! % 10).toString()}`;
}

async function assertEmailFree(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw AppError.conflict('Bu email allaqachon band');
  }
}

async function createPortalUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roleKey: string;
  branchId: string;
}): Promise<{ id: string; password: string }> {
  const role = await prisma.role.findUnique({ where: { key: input.roleKey }, select: { id: true } });
  if (!role) {
    throw AppError.unprocessable('Kabinet roli topilmadi — seed yoki bootstrap ishga tushirilmagan');
  }
  const password = generatePassword();
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      passwordHash: await hashPassword(password),
      status: 'ACTIVE',
      roleId: role.id,
      branchId: input.branchId,
      passwordChangedAt: new Date(),
    },
    select: { id: true },
  });
  return { id: user.id, password };
}

export const portalAccountService = {
  /** O'quvchiga kabinet ochish */
  async createForStudent(actor: AuthUser, studentId: string, email: string, client: ClientInfo): Promise<PortalAccountDto> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, phone: true, userId: true, branchId: true },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');
    if (student.userId) throw AppError.conflict('Bu o‘quvchida kabinet allaqachon ochilgan');
    await assertEmailFree(email);

    const created = await prisma.$transaction(async (tx) => {
      const user = await createPortalUser({
        email,
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        roleKey: ROLE_KEYS.STUDENT,
        branchId: student.branchId,
      });
      await tx.student.update({ where: { id: student.id }, data: { userId: user.id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'portal.student_account_created',
        entityType: 'student',
        entityId: student.id,
        metadata: { email },
        ...client,
      });
      return user;
    });

    return { userId: created.id, email, temporaryPassword: created.password };
  },

  /** Ota-onaga kabinet ochish — u biriktirilgan barcha farzandlarini ko'radi */
  async createForParent(actor: AuthUser, parentId: string, email: string, client: ClientInfo): Promise<PortalAccountDto> {
    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        userId: true,
        students: { select: { student: { select: { branchId: true } } }, take: 1 },
      },
    });
    if (!parent) throw AppError.notFound('Ota-ona topilmadi');
    if (parent.userId) throw AppError.conflict('Bu ota-onada kabinet allaqachon ochilgan');
    if (parent.students.length === 0) {
      throw AppError.unprocessable('Avval ota-onani farzandiga biriktiring');
    }
    await assertEmailFree(email);

    const created = await prisma.$transaction(async (tx) => {
      const user = await createPortalUser({
        email,
        firstName: parent.firstName,
        lastName: parent.lastName,
        phone: parent.phone,
        roleKey: ROLE_KEYS.PARENT,
        // Ota-ona farzandi o'qiydigan filialga biriktiriladi
        branchId: parent.students[0]!.student.branchId,
      });
      await tx.parent.update({ where: { id: parent.id }, data: { userId: user.id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'portal.parent_account_created',
        entityType: 'parent',
        entityId: parent.id,
        metadata: { email },
        ...client,
      });
      return user;
    });

    return { userId: created.id, email, temporaryPassword: created.password };
  },
};
