import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { permissionService } from './permission.service.js';
import { paymentScheduleService } from './paymentSchedule.service.js';
import type { PaymentScheduleDto } from './paymentSchedule.service.js';
import { buildStudentProfile } from './studentProgress.service.js';
import type { StudentProfileDto } from './studentProgress.service.js';
import { studentSelect as studentDtoSelect, toStudentDto } from './student.service.js';

/**
 * Kabinet (portal) — o'quvchi va ota-ona uchun.
 *
 * Asosiy qoida: **hech qanday xodim ruxsati ishlatilmaydi**. Kirish huquqi faqat
 * `User → Student.userId` yoki `User → Parent.userId` bog'lanishi orqali aniqlanadi,
 * ya'ni foydalanuvchi faqat o'ziga (yoki o'z farzandiga) tegishli ma'lumotni ko'radi.
 * Har bir so'rovda bog'lanish qaytadan tekshiriladi — `studentId` ni so'rovdan olib,
 * unga ishonib bo'lmaydi.
 */

export interface PortalChildDto {
  studentId: string;
  firstName: string;
  lastName: string;
  code: string;
  groupName: string | null;
  courseName: string;
}

export interface PortalMeDto {
  kind: 'STUDENT' | 'PARENT';
  fullName: string;
  /** Ota-ona uchun — farzandlar ro'yxati; o'quvchi uchun bitta yozuv */
  children: PortalChildDto[];
}

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  number: true,
  group: { select: { name: true } },
  course: { select: { name: true } },
} satisfies Prisma.StudentSelect;

function toChild(row: Prisma.StudentGetPayload<{ select: typeof studentSelect }>): PortalChildDto {
  return {
    studentId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    code: `ST-${String(row.number).padStart(6, '0')}`,
    groupName: row.group?.name ?? null,
    courseName: row.course.name,
  };
}

/** Foydalanuvchi kabinetda qaysi o'quvchilarni ko'ra oladi */
async function resolveScope(actor: AuthUser): Promise<{ kind: 'STUDENT' | 'PARENT'; fullName: string; studentIds: string[] }> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);

  if (permissions.has(PERMISSIONS.PORTAL_STUDENT)) {
    const student = await prisma.student.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw AppError.forbidden('Bu hisobga o‘quvchi biriktirilmagan');
    }
    return { kind: 'STUDENT', fullName: `${student.firstName} ${student.lastName}`, studentIds: [student.id] };
  }

  if (permissions.has(PERMISSIONS.PORTAL_PARENT)) {
    const parent = await prisma.parent.findFirst({
      where: { userId: actor.id },
      select: {
        firstName: true,
        lastName: true,
        students: { where: { student: { deletedAt: null } }, select: { studentId: true } },
      },
    });
    if (!parent) {
      throw AppError.forbidden('Bu hisobga ota-ona profili biriktirilmagan');
    }
    return {
      kind: 'PARENT',
      fullName: `${parent.firstName} ${parent.lastName}`,
      studentIds: parent.students.map((link) => link.studentId),
    };
  }

  throw AppError.forbidden('Kabinetga kirish huquqi yo‘q');
}

/** So'ralgan o'quvchi haqiqatan shu foydalanuvchiga tegishlimi — har safar tekshiriladi */
async function requireOwnStudent(actor: AuthUser, requestedId?: string): Promise<string> {
  const scope = await resolveScope(actor);
  if (scope.studentIds.length === 0) {
    throw AppError.forbidden('Hisobga farzand biriktirilmagan');
  }
  if (!requestedId) return scope.studentIds[0]!;
  if (!scope.studentIds.includes(requestedId)) {
    throw AppError.forbidden('Bu o‘quvchi ma’lumotlariga ruxsat yo‘q');
  }
  return requestedId;
}

export const portalService = {
  async me(actor: AuthUser): Promise<PortalMeDto> {
    const scope = await resolveScope(actor);
    const rows = await prisma.student.findMany({
      where: { id: { in: scope.studentIds }, deletedAt: null },
      select: studentSelect,
      orderBy: { firstName: 'asc' },
    });
    return { kind: scope.kind, fullName: scope.fullName, children: rows.map(toChild) };
  },

  /** To'liq profil: XP, davomat, uy vazifasi, imtihonlar, to'lovlar, progress dinamikasi */
  async profile(actor: AuthUser, requestedStudentId?: string): Promise<StudentProfileDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const record = await prisma.student.findFirstOrThrow({
      where: { id: studentId, deletedAt: null },
      select: studentDtoSelect,
    });
    // To'lovlar kabinetda ko'rinadi — o'quvchi o'z to'lov tarixini ko'rishi tabiiy
    return buildStudentProfile(toStudentDto(record), { includePayments: true });
  },

  /** To'lov jadvali: nechta qism, qaysi biri kechikkan, keyingi muddat */
  async schedule(actor: AuthUser, requestedStudentId?: string): Promise<PaymentScheduleDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return paymentScheduleService.get(studentId);
  },
};

/** Kabinet hisobi ochilganda qaytadigan ma'lumot — parol faqat shu javobda ko'rinadi */
export interface PortalAccountDto {
  userId: string;
  email: string;
  /** Vaqtinchalik parol — xodim uni egasiga yetkazadi, keyin egasi o'zgartiradi */
  temporaryPassword: string;
}
