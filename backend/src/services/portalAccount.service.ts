import { randomBytes } from 'node:crypto';
import { prisma } from '../config/database.js';
import { ROLE_KEYS } from '../config/permissions.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { STUDENT_LOGIN_PATTERN } from '../validators/auth.validator.js';
import type { BulkPortalAccountsInput } from '../validators/portal.validator.js';
import { auditService } from './audit.service.js';
import { assertBranchAccess, branchFilter, getBranchAccess } from './branchAccess.js';
import type { PortalAccountDto } from './portal.service.js';

/**
 * O'quvchi va ota-ona uchun kabinet hisobini ochish — **xodim tomonidan** bajariladi
 * (`portal.manage` ruxsati). Parol tizim tomonidan generatsiya qilinadi va faqat
 * yaratish (yoki tiklash) javobida bir marta ko'rsatiladi; bazada faqat bcrypt hash saqlanadi.
 *
 * O'quvchilarning ko'pchiligida email yo'q, shuning uchun o'quvchi **ID raqami** bilan kiradi
 * (`ST-000045`). Email berilmasa, `User.email` ga ichki manzil yoziladi
 * (`st000045@kabinet.invalid` — `.invalid` RFC 2606 bo'yicha hech qachon mavjud bo'lmaydi,
 * unga xat ketmaydi). Login paytida ID raqami shu hisobga aylantiriladi.
 */

/** O'qish oson bo'lishi uchun chalkashadigan belgilar (0/O, 1/l/I) ishlatilmaydi */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Emailsiz o'quvchi hisoblari uchun domen — haqiqiy pochta emas */
export const STUDENT_LOGIN_DOMAIN = 'kabinet.invalid';

/** Bir so'rovda ochiladigan eng ko'p hisob (bcrypt sekin — so'rov cho'zilib ketmasin) */
const BULK_LIMIT = 300;
/** bcrypt parallel hisoblanadi, lekin CPU'ni to'liq egallamasligi uchun bo'laklab */
const HASH_CONCURRENCY = 8;

function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  let password = '';
  for (const byte of bytes) password += ALPHABET[byte % ALPHABET.length];
  // Parol siyosati: katta harf, kichik harf va raqam bo'lishi shart
  return `${password.slice(0, length - 3)}Aa${(bytes[0]! % 10).toString()}`;
}

export function studentLoginEmail(number: number): string {
  return `st${String(number).padStart(6, '0')}@${STUDENT_LOGIN_DOMAIN}`;
}

/**
 * Kirish maydonidagi qiymatni hisob emailiga aylantiradi.
 * `ST-000045` → o'sha o'quvchi hisobining emaili (email bilan ochilgan bo'lsa ham ishlaydi);
 * topilmasa yoki email kiritilgan bo'lsa — kichik harfli qiymatning o'zi.
 */
export async function resolveLoginIdentifier(identifier: string): Promise<string> {
  const value = identifier.trim();
  const match = STUDENT_LOGIN_PATTERN.exec(value);
  if (!match) return value.toLowerCase();
  const student = await prisma.student.findFirst({
    where: { number: Number(match[1]), deletedAt: null },
    select: { user: { select: { email: true } } },
  });
  return student?.user?.email ?? value.toLowerCase();
}

async function assertEmailFree(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw AppError.conflict('Bu email allaqachon band');
  }
}

async function roleId(key: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { key }, select: { id: true } });
  if (!role) {
    throw AppError.unprocessable('Kabinet roli topilmadi — seed yoki bootstrap ishga tushirilmagan');
  }
  return role.id;
}

async function createPortalUser(
  tx: Prisma.TransactionClient,
  input: { email: string; firstName: string; lastName: string; phone: string | null; roleId: string; branchId: string; passwordHash: string },
): Promise<string> {
  const user = await tx.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      roleId: input.roleId,
      branchId: input.branchId,
      passwordChangedAt: new Date(),
    },
    select: { id: true },
  });
  return user.id;
}

/** Parollarni bo'laklab parallel hash qiladi */
async function hashAll(passwords: string[]): Promise<string[]> {
  const result: string[] = [];
  for (let index = 0; index < passwords.length; index += HASH_CONCURRENCY) {
    const chunk = passwords.slice(index, index + HASH_CONCURRENCY);
    result.push(...(await Promise.all(chunk.map((password) => hashPassword(password)))));
  }
  return result;
}

export interface BulkPortalAccountRow {
  studentId: string;
  code: string;
  fullName: string;
  groupName: string | null;
  login: string;
  temporaryPassword: string;
}

export interface BulkPortalAccountsResult {
  created: BulkPortalAccountRow[];
  /** Allaqachon kabineti bor — o'tkazib yuborildi */
  skipped: number;
}

const studentAccountSelect = {
  id: true,
  number: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  userId: true,
  branchId: true,
  group: { select: { name: true } },
} satisfies Prisma.StudentSelect;

export const portalAccountService = {
  /**
   * O'quvchiga kabinet ochish. Email ixtiyoriy: berilmasa o'quvchi ID raqami bilan kiradi.
   * Email berilsa ham ID bilan kirish ishlaydi.
   */
  async createForStudent(actor: AuthUser, studentId: string, email: string | undefined, client: ClientInfo): Promise<PortalAccountDto> {
    const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: studentAccountSelect });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');
    assertBranchAccess(await getBranchAccess(actor), student.branchId);
    if (student.userId) throw AppError.conflict('Bu o‘quvchida kabinet allaqachon ochilgan');

    const accountEmail = email ?? studentLoginEmail(student.number);
    await assertEmailFree(accountEmail);
    const password = generatePassword();
    const [passwordHash, role] = await Promise.all([hashPassword(password), roleId(ROLE_KEYS.STUDENT)]);

    const userId = await prisma.$transaction(async (tx) => {
      const id = await createPortalUser(tx, {
        email: accountEmail,
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        roleId: role,
        branchId: student.branchId,
        passwordHash,
      });
      await tx.student.update({ where: { id: student.id }, data: { userId: id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'portal.student_account_created',
        entityType: 'student',
        entityId: student.id,
        metadata: { email: email ?? null, login: formatStudentNumber(student.number) },
        ...client,
      });
      return id;
    });

    return { userId, email: accountEmail, login: formatStudentNumber(student.number), temporaryPassword: password };
  },

  /**
   * Ko'p o'quvchiga birdan kabinet ochish (masalan, tizim ishga tushganda hammaga).
   * Faqat faol va kabineti yo'q o'quvchilar; xodim filiali doirasida.
   * Natijada login va parollar **bir marta** qaytadi — xodim ularni chop etadi yoki tarqatadi.
   */
  async bulkCreateForStudents(actor: AuthUser, input: BulkPortalAccountsInput, client: ClientInfo): Promise<BulkPortalAccountsResult> {
    const access = await getBranchAccess(actor);
    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
      ...branchFilter(access),
      ...(input.studentIds ? { id: { in: input.studentIds } } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
    };
    const [candidates, skipped] = await Promise.all([
      prisma.student.findMany({
        where: { ...where, userId: null },
        select: studentAccountSelect,
        orderBy: [{ group: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
        take: BULK_LIMIT + 1,
      }),
      prisma.student.count({ where: { ...where, userId: { not: null } } }),
    ]);
    if (candidates.length > BULK_LIMIT) {
      throw AppError.unprocessable(`Bir martada ko‘pi bilan ${BULK_LIMIT} ta kabinet ochiladi — guruh bo‘yicha tanlang`);
    }
    if (candidates.length === 0) return { created: [], skipped };

    // Emailsiz ochiladi: ichki manzil ID raqamidan olinadi, shuning uchun to'qnashuv bo'lmaydi.
    // O'quvchida email bo'lsa ham ishlatilmaydi — u boshqa hisobda band bo'lishi mumkin.
    const emails = candidates.map((student) => studentLoginEmail(student.number));
    const taken = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    if (taken.length > 0) {
      throw AppError.conflict(`Ba’zi loginlar band: ${taken.map((row) => row.email).join(', ')}`);
    }

    const passwords = candidates.map(() => generatePassword());
    const [hashes, role] = await Promise.all([hashAll(passwords), roleId(ROLE_KEYS.STUDENT)]);

    await prisma.$transaction(
      async (tx) => {
        for (const [index, student] of candidates.entries()) {
          const id = await createPortalUser(tx, {
            email: emails[index]!,
            firstName: student.firstName,
            lastName: student.lastName,
            phone: student.phone,
            roleId: role,
            branchId: student.branchId,
            passwordHash: hashes[index]!,
          });
          await tx.student.update({ where: { id: student.id }, data: { userId: id } });
        }
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'portal.student_accounts_bulk_created',
          entityType: 'student',
          metadata: { count: candidates.length, skipped, groupId: input.groupId ?? null, studentIds: candidates.map((student) => student.id) },
          ...client,
        });
      },
      { timeout: 60_000 },
    );

    return {
      created: candidates.map((student, index) => ({
        studentId: student.id,
        code: formatStudentNumber(student.number),
        fullName: `${student.firstName} ${student.lastName}`,
        groupName: student.group?.name ?? null,
        login: formatStudentNumber(student.number),
        temporaryPassword: passwords[index]!,
      })),
      skipped,
    };
  },

  /**
   * O'quvchi parolini unutdi — xodim yangi vaqtinchalik parol beradi.
   * Emailsiz hisobda "parolni unutdim" ishlamaydi, shuning uchun bu yagona yo'l.
   * Eski sessiyalar yopiladi (`passwordChangedAt` + refresh tokenlar bekor).
   */
  async resetStudentPassword(actor: AuthUser, studentId: string, client: ClientInfo): Promise<PortalAccountDto> {
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, number: true, branchId: true, userId: true, user: { select: { email: true } } },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');
    assertBranchAccess(await getBranchAccess(actor), student.branchId);
    if (!student.userId || !student.user) throw AppError.unprocessable('Bu o‘quvchida kabinet ochilmagan');

    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    const userId = student.userId;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), status: 'ACTIVE' } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'portal.student_password_reset',
        entityType: 'student',
        entityId: student.id,
        ...client,
      });
    });

    return { userId, email: student.user.email, login: formatStudentNumber(student.number), temporaryPassword: password };
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
    const password = generatePassword();
    const [passwordHash, role] = await Promise.all([hashPassword(password), roleId(ROLE_KEYS.PARENT)]);

    const userId = await prisma.$transaction(async (tx) => {
      const id = await createPortalUser(tx, {
        email,
        firstName: parent.firstName,
        lastName: parent.lastName,
        phone: parent.phone,
        roleId: role,
        // Ota-ona farzandi o'qiydigan filialga biriktiriladi
        branchId: parent.students[0]!.student.branchId,
        passwordHash,
      });
      await tx.parent.update({ where: { id: parent.id }, data: { userId: id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'portal.parent_account_created',
        entityType: 'parent',
        entityId: parent.id,
        metadata: { email },
        ...client,
      });
      return id;
    });

    return { userId, email, login: email, temporaryPassword: password };
  },
};
