import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { permissionService } from './permission.service.js';
import { feedbackService } from './feedback.service.js';
import { certificateService } from './certificate.service.js';
import { curriculumService } from './curriculum.service.js';
import { businessDateString, startOfBusinessDay } from '../utils/dates.js';
import type { WeekDay } from '../generated/prisma/client.js';
import type { FeedbackDto } from './feedback.service.js';
import type { FeedbackType } from '../generated/prisma/client.js';
import type { PortalFeedbackBody } from '../validators/feedback.validator.js';
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
export async function resolvePortalScope(actor: AuthUser): Promise<{ kind: 'STUDENT' | 'PARENT'; fullName: string; studentIds: string[] }> {
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
  const scope = await resolvePortalScope(actor);
  if (scope.studentIds.length === 0) {
    throw AppError.forbidden('Hisobga farzand biriktirilmagan');
  }
  if (!requestedId) return scope.studentIds[0]!;
  if (!scope.studentIds.includes(requestedId)) {
    throw AppError.forbidden('Bu o‘quvchi ma’lumotlariga ruxsat yo‘q');
  }
  return requestedId;
}

export interface PortalLessonDto {
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: 'PLANNED' | 'HELD' | 'CANCELLED';
  topic?: string | null;
}

export interface PortalLessonsDto {
  group: { id: string; name: string; course: string } | null;
  /** O'qituvchi haqida faqat ism va yo'nalish — telefon va email ko'rsatilmaydi */
  teacher: { name: string; specialization: string | null } | null;
  lessons: PortalLessonDto[];
}

export const portalService = {
  async me(actor: AuthUser): Promise<PortalMeDto> {
    const scope = await resolvePortalScope(actor);
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

  /**
   * Kelgusi darslar: guruh jadvalidan keyingi 14 kun ichidagi darslar.
   *
   * Rejalashtirilgan dars seansi (`AttendanceSession`) bo'lsa, uning holati ham qo'shiladi —
   * bekor qilingan dars ro'yxatda "bekor qilingan" deb ko'rinadi, o'quvchi bekorga kelmasin.
   */
  async lessons(actor: AuthUser, requestedStudentId?: string): Promise<PortalLessonsDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const student = await prisma.student.findFirstOrThrow({
      where: { id: studentId, deletedAt: null },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            scheduleDays: true,
            startTime: true,
            endTime: true,
            status: true,
            endDate: true,
            roomRef: { select: { name: true } },
            room: true,
            teacher: { select: { firstName: true, lastName: true, teacherProfile: { select: { specialization: true } } } },
            course: { select: { name: true } },
          },
        },
      },
    });

    const group = student.group;
    if (!group || group.status !== 'ACTIVE') {
      return { group: null, teacher: null, lessons: [] };
    }

    const now = new Date();
    const today = startOfBusinessDay(now);
    const lessons: PortalLessonDto[] = [];
    const weekdayNames: WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    // Keyingi 14 kunni ko'rib chiqamiz — jadval haftalik takrorlanadi
    for (let offset = 0; offset < 14 && lessons.length < 8; offset += 1) {
      const date = new Date(today.getTime() + offset * 86_400_000);
      const weekday = weekdayNames[date.getUTCDay()]!;
      if (!group.scheduleDays.includes(weekday)) continue;
      if (group.endDate && date > group.endDate) break;
      lessons.push({
        date: businessDateString(date),
        startTime: group.startTime,
        endTime: group.endTime,
        room: group.roomRef?.name ?? group.room ?? null,
        status: 'PLANNED',
      });
    }

    // Rejalashtirilgan seanslar holatini qo'shamiz (bekor qilingan darslar ko'rinsin)
    const sessions = await prisma.attendanceSession.findMany({
      where: { groupId: group.id, date: { gte: today } },
      // `topic` — matn (eski usul), `topicRef` — kurrikulum mavzusi
      select: { date: true, status: true, topic: true, curriculumTopic: { select: { title: true } } },
    });
    const byDate = new Map(sessions.map((session) => [businessDateString(session.date), session]));
    for (const lesson of lessons) {
      const session = byDate.get(lesson.date);
      if (!session) continue;
      lesson.status = session.status;
      lesson.topic = session.curriculumTopic?.title ?? session.topic ?? null;
    }

    return {
      group: { id: group.id, name: group.name, course: group.course.name },
      teacher: group.teacher
        ? {
            name: `${group.teacher.firstName} ${group.teacher.lastName}`,
            specialization: group.teacher.teacherProfile?.specialization ?? null,
          }
        : null,
      lessons,
    };
  },

  /** Kurs dasturi bo'yicha progress — o'quvchi qaysi mavzularni o'tganini ko'radi */
  async curriculum(actor: AuthUser, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return curriculumService.studentProgress(studentId);
  },

  /** O'quvchining sertifikatlari (bekor qilinganlari ko'rsatilmaydi) */
  async certificates(actor: AuthUser, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const { items } = await certificateService.list({ page: 1, limit: 20, studentId, includeRevoked: false } as never);
    return items;
  },

  /** Bugun qaysi fikrlar qoldirilgani — kabinetda formani yashirish uchun */
  async feedbackState(actor: AuthUser, requestedStudentId?: string): Promise<{ answeredToday: FeedbackType[] }> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return feedbackService.pendingForStudent(studentId);
  },

  /**
   * Kabinetdan fikr qoldirish. `studentId` **so'rovdan olinmaydi** — faqat hisobga
   * bog'langan o'quvchi (yoki ota-onaning farzandi) uchun yoziladi.
   */
  async submitFeedback(actor: AuthUser, input: PortalFeedbackBody, requestedStudentId?: string): Promise<FeedbackDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return feedbackService.create({ ...input, studentId });
  },
};

/** Kabinet hisobi ochilganda qaytadigan ma'lumot — parol faqat shu javobda ko'rinadi */
export interface PortalAccountDto {
  userId: string;
  email: string;
  /** Vaqtinchalik parol — xodim uni egasiga yetkazadi, keyin egasi o'zgartiradi */
  temporaryPassword: string;
}
