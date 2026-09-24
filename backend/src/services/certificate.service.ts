import { randomBytes } from 'node:crypto';
import { prisma } from '../config/database.js';
import type { AuthUser } from '../types/auth.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { CertificateListQuery, IssueCertificateInput, RevokeCertificateInput } from '../validators/certificate.validator.js';
import { auditService } from './audit.service.js';
import { notifyCertificateIssued } from './studentNotify.service.js';

/**
 * Sertifikatlar.
 *
 * Tamoyil: sertifikat — **hujjat**, jonli ma'lumot emas. Shuning uchun o'quvchi ismi,
 * kurs va o'qituvchi nomi berilgan paytdagi holatda nusxalanadi: keyin yozuvlar
 * tahrirlansa ham berilgan hujjat o'zgarmaydi.
 *
 * Bekor qilish (`revoke`) — o'chirish emas: yozuv qoladi va ochiq tekshiruvda
 * "haqiqiy emas" deb ko'rsatiladi.
 */

const certificateSelect = {
  id: true,
  number: true,
  verifyToken: true,
  studentId: true,
  courseId: true,
  studentName: true,
  courseName: true,
  teacherName: true,
  branchName: true,
  startDate: true,
  completionDate: true,
  percentage: true,
  grade: true,
  note: true,
  issuedAt: true,
  revokedAt: true,
  revokeReason: true,
  issuedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.CertificateSelect;

type CertificateRecord = Prisma.CertificateGetPayload<{ select: typeof certificateSelect }>;

export interface CertificateDto {
  id: string;
  /** CRT-2026-000123 */
  code: string;
  verifyToken: string;
  studentId: string;
  studentName: string;
  courseName: string;
  teacherName: string | null;
  branchName: string | null;
  startDate: string;
  completionDate: string;
  percentage: number | null;
  grade: string | null;
  note: string | null;
  issuedAt: string;
  issuedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

/** Ochiq tekshiruvda qaytariladigan **minimal** ma'lumot — telefon, email va ID yo'q */
export interface CertificateVerificationDto {
  valid: boolean;
  code: string;
  studentName: string;
  courseName: string;
  teacherName: string | null;
  completionDate: string;
  grade: string | null;
  issuedAt: string;
  revokedAt: string | null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function certificateCode(number: number, issuedAt: Date): string {
  return `CRT-${issuedAt.getUTCFullYear()}-${String(number).padStart(6, '0')}`;
}

function toDto(record: CertificateRecord): CertificateDto {
  return {
    id: record.id,
    code: certificateCode(record.number, record.issuedAt),
    verifyToken: record.verifyToken,
    studentId: record.studentId,
    studentName: record.studentName,
    courseName: record.courseName,
    teacherName: record.teacherName,
    branchName: record.branchName,
    startDate: toDateOnly(record.startDate),
    completionDate: toDateOnly(record.completionDate),
    percentage: record.percentage,
    grade: record.grade,
    note: record.note,
    issuedAt: record.issuedAt.toISOString(),
    issuedBy: record.issuedBy ? `${record.issuedBy.firstName} ${record.issuedBy.lastName}` : null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokeReason: record.revokeReason,
  };
}

function gradeFor(percentage: number | null): string | null {
  if (percentage === null) return null;
  return percentage >= 90 ? '5' : percentage >= 75 ? '4' : percentage >= 60 ? '3' : '2';
}

export const certificateService = {
  async list(query: CertificateListQuery): Promise<{ items: CertificateDto[]; total: number }> {
    const where: Prisma.CertificateWhereInput = {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.includeRevoked ? {} : { revokedAt: null }),
    };
    const items = await prisma.certificate.findMany({
      where,
      select: certificateSelect,
      orderBy: { issuedAt: 'desc' },
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.certificate.count({ where });
    return { items: items.map(toDto), total };
  },

  async issue(actor: AuthUser, input: IssueCertificateInput, client: ClientInfo): Promise<CertificateDto> {
    const student = await prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        startDate: true,
        courseId: true,
        course: { select: { id: true, name: true } },
        group: { select: { id: true, teacher: { select: { firstName: true, lastName: true } } } },
        branch: { select: { name: true } },
      },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');

    if (input.courseId && input.courseId !== student.courseId) {
      throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
        { field: 'courseId', message: 'Bu kurs o‘quvchiga tegishli emas' },
      ]);
    }

    const existing = await prisma.certificate.findFirst({
      where: { studentId: student.id, courseId: student.courseId, revokedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('Bu kurs bo‘yicha sertifikat allaqachon berilgan');
    }

    // Natija ko'rsatilmasa — imtihon natijalaridan o'rtacha
    let percentage = input.percentage ?? null;
    if (percentage === null) {
      const average = await prisma.examResult.aggregate({
        where: { studentId: student.id, exam: { courseId: student.courseId } },
        _avg: { percentage: true },
      });
      percentage = average._avg.percentage === null ? null : Math.round(average._avg.percentage);
    }

    const certificate = await prisma.$transaction(async (tx) => {
      const created = await tx.certificate.create({
        data: {
          verifyToken: randomBytes(16).toString('hex'),
          studentId: student.id,
          courseId: student.courseId,
          groupId: student.group?.id ?? null,
          // Nusxalar: keyin o'quvchi yoki kurs tahrirlansa ham hujjat o'zgarmaydi
          studentName: `${student.firstName} ${student.lastName}`,
          courseName: student.course.name,
          teacherName: student.group?.teacher ? `${student.group.teacher.firstName} ${student.group.teacher.lastName}` : null,
          branchName: student.branch?.name ?? null,
          startDate: student.startDate,
          completionDate: input.completionDate ?? new Date(),
          percentage,
          grade: gradeFor(percentage),
          note: input.note ?? null,
          issuedById: actor.id,
        },
        select: certificateSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'certificate.issued',
        entityType: 'student',
        entityId: student.id,
        metadata: { certificateId: created.id, number: created.number, percentage },
        ...client,
      });
      await notifyCertificateIssued(tx, created.id);
      return created;
    });

    return toDto(certificate);
  },

  async revoke(actor: AuthUser, id: string, input: RevokeCertificateInput, client: ClientInfo): Promise<CertificateDto> {
    const current = await prisma.certificate.findUnique({ where: { id }, select: { id: true, studentId: true, revokedAt: true } });
    if (!current) throw AppError.notFound('Sertifikat topilmadi');
    if (current.revokedAt) throw AppError.unprocessable('Bu sertifikat allaqachon bekor qilingan');

    const certificate = await prisma.$transaction(async (tx) => {
      const saved = await tx.certificate.update({
        where: { id },
        data: { revokedAt: new Date(), revokedById: actor.id, revokeReason: input.reason },
        select: certificateSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'certificate.revoked',
        entityType: 'student',
        entityId: current.studentId,
        metadata: { certificateId: id, reason: input.reason },
        ...client,
      });
      return saved;
    });

    return toDto(certificate);
  },

  /**
   * Ochiq tekshiruv — autentifikatsiyasiz. Faqat hujjatni tasdiqlash uchun zarur
   * minimal ma'lumot qaytariladi: telefon, email, ID va moliyaviy ma'lumot yo'q.
   */
  /**
   * Chop etish uchun to'liq ma'lumot.
   *
   * Ruxsat qoidasi: `student.view` huquqi bo'lgan xodim istalgan sertifikatni oladi;
   * kabinet foydalanuvchisi esa **faqat o'ziga (yoki farzandiga) tegishlisini**.
   * Ochiq tekshiruv javobi kengaytirilmadi — u ataylab minimal (PHASE 6 qarori).
   */
  async getForActor(id: string, allowedStudentIds: readonly string[] | null): Promise<CertificateDto> {
    const record = await prisma.certificate.findUnique({ where: { id }, select: certificateSelect });
    if (!record) throw AppError.notFound('Sertifikat topilmadi');
    if (allowedStudentIds !== null && !allowedStudentIds.includes(record.studentId)) {
      throw AppError.forbidden('Bu sertifikat sizga tegishli emas');
    }
    return toDto(record);
  },

  async verify(token: string): Promise<CertificateVerificationDto | null> {
    const record = await prisma.certificate.findUnique({ where: { verifyToken: token }, select: certificateSelect });
    if (!record) return null;
    return {
      valid: record.revokedAt === null,
      code: certificateCode(record.number, record.issuedAt),
      studentName: record.studentName,
      courseName: record.courseName,
      teacherName: record.teacherName,
      completionDate: toDateOnly(record.completionDate),
      grade: record.grade,
      issuedAt: record.issuedAt.toISOString(),
      revokedAt: record.revokedAt?.toISOString() ?? null,
    };
  },
};
