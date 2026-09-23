import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { FeedbackType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { getBranchAccess, resolveBranchId } from './branchAccess.js';
import { notificationService } from './notification.service.js';

/**
 * O'quvchi fikri va NPS.
 *
 * Tamoyillar:
 *  - **Anonimlik haqiqiy:** `isAnonymous` bo'lsa xodimga ism ham, o'quvchi ID si ham qaytarilmaydi.
 *    Yozuvda studentId qoladi — takror javobni oldini olish va statistika uchun, lekin u DTO ga chiqmaydi.
 *  - **Past baho e'tiborsiz qolmaydi:** 1–2 yulduz yoki NPS ≤ 6 bo'lsa mas'ul xodimlarga bildirishnoma
 *    boradi va fikr "ishlanmagan" holatda turadi, xodim uni yopmaguncha.
 *  - **Bir so'rov — bir javob:** bir kunda bir xil turdagi fikr ikki marta yozilmaydi.
 */

/** Shu balldan past baho "salbiy" hisoblanadi */
export const NEGATIVE_RATING = 2;
/** NPS: shu balldan past — tanqidchi (detractor) */
export const NPS_DETRACTOR_MAX = 6;
/** NPS: shu balldan yuqori — tarafdor (promoter) */
export const NPS_PROMOTER_MIN = 9;

const feedbackSelect = {
  id: true,
  studentId: true,
  type: true,
  rating: true,
  npsScore: true,
  comment: true,
  isAnonymous: true,
  handledAt: true,
  handleNote: true,
  createdAt: true,
  student: { select: { id: true, number: true, firstName: true, lastName: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  handledBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.FeedbackSelect;

type FeedbackRecord = Prisma.FeedbackGetPayload<{ select: typeof feedbackSelect }>;

export interface FeedbackDto {
  id: string;
  type: FeedbackType;
  rating: number | null;
  npsScore: number | null;
  comment: string | null;
  isAnonymous: boolean;
  /** Anonim fikrda `null` */
  student: { id: string; number: number; name: string } | null;
  teacher: { id: string; name: string } | null;
  course: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  isNegative: boolean;
  handledAt: string | null;
  handledBy: string | null;
  handleNote: string | null;
  createdAt: string;
}

export function isNegativeFeedback(record: { type: FeedbackType; rating: number | null; npsScore: number | null }): boolean {
  if (record.type === 'NPS') return record.npsScore !== null && record.npsScore <= NPS_DETRACTOR_MAX;
  return record.rating !== null && record.rating <= NEGATIVE_RATING;
}

function toDto(record: FeedbackRecord): FeedbackDto {
  return {
    id: record.id,
    type: record.type,
    rating: record.rating,
    npsScore: record.npsScore,
    comment: record.comment,
    isAnonymous: record.isAnonymous,
    // Anonim fikrda o'quvchi haqida hech narsa qaytarilmaydi
    student: record.isAnonymous
      ? null
      : { id: record.student.id, number: record.student.number, name: `${record.student.firstName} ${record.student.lastName}` },
    teacher: record.teacher ? { id: record.teacher.id, name: `${record.teacher.firstName} ${record.teacher.lastName}` } : null,
    course: record.course,
    group: record.group,
    isNegative: isNegativeFeedback(record),
    handledAt: record.handledAt?.toISOString() ?? null,
    handledBy: record.handledBy ? `${record.handledBy.firstName} ${record.handledBy.lastName}` : null,
    handleNote: record.handleNote,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface FeedbackStats {
  total: number;
  /** O'rtacha bahоlar (1–5), fikr bo'lmasa null */
  teacherAverage: number | null;
  courseAverage: number | null;
  academyAverage: number | null;
  /** NPS = tarafdorlar% − tanqidchilar% (−100 … +100) */
  nps: number | null;
  npsResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** Ishlanmagan salbiy fikrlar */
  openNegative: number;
  /** Baholar taqsimoti: 1–5 yulduz nechtadan */
  ratingDistribution: Array<{ rating: number; count: number }>;
}

export interface CreateFeedbackInput {
  studentId: string;
  type: FeedbackType;
  teacherId?: string | undefined;
  courseId?: string | undefined;
  groupId?: string | undefined;
  rating?: number | undefined;
  npsScore?: number | undefined;
  comment?: string | undefined;
  isAnonymous?: boolean | undefined;
}

function startOfDay(now: Date): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

export const feedbackService = {
  async list(query: {
    page: number;
    limit: number;
    type?: FeedbackType | undefined;
    teacherId?: string | undefined;
    studentId?: string | undefined;
    onlyNegative?: boolean | undefined;
    onlyOpen?: boolean | undefined;
  }): Promise<{ items: FeedbackDto[]; total: number }> {
    const negative: Prisma.FeedbackWhereInput = {
      OR: [
        { type: { not: 'NPS' }, rating: { lte: NEGATIVE_RATING } },
        { type: 'NPS', npsScore: { lte: NPS_DETRACTOR_MAX } },
      ],
    };
    const where: Prisma.FeedbackWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.onlyNegative || query.onlyOpen ? negative : {}),
      ...(query.onlyOpen ? { handledAt: null } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.feedback.findMany({ where, select: feedbackSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query.page, query.limit) }),
      prisma.feedback.count({ where }),
    ]);
    return { items: items.map(toDto), total };
  },

  /** Statistika. `teacherId` berilsa — faqat shu o'qituvchi bo'yicha (o'qituvchi o'z panelida ko'radi). */
  async stats(filter: { teacherId?: string | undefined; from?: Date | undefined } = {}): Promise<FeedbackStats> {
    const where: Prisma.FeedbackWhereInput = {
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
      ...(filter.from ? { createdAt: { gte: filter.from } } : {}),
    };

    const [byType, npsRows, distribution, openNegative, total] = await Promise.all([
      prisma.feedback.groupBy({ by: ['type'], where: { ...where, rating: { not: null } }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.feedback.findMany({ where: { ...where, type: 'NPS', npsScore: { not: null } }, select: { npsScore: true } }),
      prisma.feedback.groupBy({ by: ['rating'], where: { ...where, rating: { not: null } }, _count: { _all: true } }),
      prisma.feedback.count({
        where: {
          ...where,
          handledAt: null,
          OR: [
            { type: { not: 'NPS' }, rating: { lte: NEGATIVE_RATING } },
            { type: 'NPS', npsScore: { lte: NPS_DETRACTOR_MAX } },
          ],
        },
      }),
      prisma.feedback.count({ where }),
    ]);

    const averageOf = (type: FeedbackType) => {
      const row = byType.find((item) => item.type === type);
      return row?._avg.rating === null || row?._avg.rating === undefined ? null : Math.round(row._avg.rating * 10) / 10;
    };

    const scores = npsRows.map((row) => row.npsScore!).filter((score) => score !== null);
    const promoters = scores.filter((score) => score >= NPS_PROMOTER_MIN).length;
    const detractors = scores.filter((score) => score <= NPS_DETRACTOR_MAX).length;
    const passives = scores.length - promoters - detractors;

    return {
      total,
      teacherAverage: averageOf('TEACHER'),
      courseAverage: averageOf('COURSE'),
      academyAverage: averageOf('ACADEMY'),
      // NPS ma'nosi faqat javoblar bo'lganda bor — aks holda null (0 emas)
      nps: scores.length === 0 ? null : Math.round(((promoters - detractors) / scores.length) * 100),
      npsResponses: scores.length,
      promoters,
      passives,
      detractors,
      openNegative,
      ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: distribution.find((row) => row.rating === rating)?._count._all ?? 0,
      })),
    };
  },

  /**
   * Fikrni yozadi. Kabinetdan (o'quvchi o'zi) ham, xodim tomonidan ham chaqiriladi —
   * `actor` xodim bo'lsa audit yoziladi.
   */
  async create(input: CreateFeedbackInput, options: { actor?: AuthUser | undefined; client?: ClientInfo | undefined } = {}): Promise<FeedbackDto> {
    const student = await prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, branchId: true, groupId: true, courseId: true, group: { select: { teacherId: true } } },
    });
    if (!student) throw AppError.notFound('O‘quvchi topilmadi');

    if (input.type === 'NPS' && input.npsScore === undefined) {
      throw AppError.unprocessable('Tavsiya ehtimoli ko‘rsatilmagan', [{ field: 'npsScore', message: '0 dan 10 gacha baho bering' }]);
    }
    if (input.type !== 'NPS' && input.rating === undefined) {
      throw AppError.unprocessable('Baho ko‘rsatilmagan', [{ field: 'rating', message: '1 dan 5 gacha baho bering' }]);
    }

    // O'qituvchi ko'rsatilmasa — o'quvchining guruh o'qituvchisi
    const teacherId = input.teacherId ?? (input.type === 'TEACHER' ? student.group?.teacherId ?? null : null);
    if (input.type === 'TEACHER' && !teacherId) {
      throw AppError.unprocessable('O‘qituvchi topilmadi — guruhga o‘qituvchi biriktirilmagan');
    }

    // Bir kunda bir xil turdagi fikr ikki marta yozilmaydi
    const duplicate = await prisma.feedback.findFirst({
      where: { studentId: student.id, type: input.type, createdAt: { gte: startOfDay(new Date()) } },
      select: { id: true },
    });
    if (duplicate) throw AppError.conflict('Bugun bu bo‘yicha fikr allaqachon qoldirilgan');

    const branchId = options.actor ? resolveBranchId(await getBranchAccess(options.actor)) : student.branchId;

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.feedback.create({
        data: {
          studentId: student.id,
          type: input.type,
          teacherId,
          courseId: input.courseId ?? student.courseId,
          groupId: input.groupId ?? student.groupId,
          rating: input.rating ?? null,
          npsScore: input.npsScore ?? null,
          comment: input.comment ?? null,
          isAnonymous: input.isAnonymous ?? false,
          branchId,
        },
        select: feedbackSelect,
      });

      if (options.actor && options.client) {
        await auditService.recordInTransaction(tx, {
          userId: options.actor.id,
          action: 'feedback.created',
          entityType: 'student',
          entityId: student.id,
          metadata: { feedbackId: record.id, type: record.type, rating: record.rating, npsScore: record.npsScore },
          ...options.client,
        });
      }

      // Past baho — mas'ul xodimlarga xabar. Anonim bo'lsa ism yozilmaydi.
      if (isNegativeFeedback(record)) {
        const staff = await tx.user.findMany({
          where: {
            deletedAt: null,
            status: 'ACTIVE',
            role: { permissions: { some: { permission: { key: PERMISSIONS.FEEDBACK_MANAGE } } } },
          },
          select: { id: true },
        });
        const who = record.isAnonymous ? 'Anonim o‘quvchi' : `${student.firstName} ${student.lastName}`;
        const score = record.type === 'NPS' ? `${record.npsScore}/10` : `${record.rating}/5`;
        for (const user of staff) {
          await notificationService.createInTransaction(tx, {
            userId: user.id,
            type: 'NEGATIVE_FEEDBACK',
            title: 'Past baho bilan fikr keldi',
            message: `${who} — ${score}${record.comment ? `: ${record.comment.slice(0, 120)}` : ''}`,
            entityType: 'feedback',
            entityId: record.id,
            dedupeKey: `feedback:${record.id}:${user.id}`,
          });
        }
      }

      return record;
    });

    return toDto(created);
  },

  /** Salbiy fikr bo'yicha ish yakunlandi (kim va nima qilgani yoziladi) */
  async markHandled(actor: AuthUser, id: string, note: string, client: ClientInfo): Promise<FeedbackDto> {
    const feedback = await prisma.feedback.findUnique({ where: { id }, select: { id: true, handledAt: true, studentId: true } });
    if (!feedback) throw AppError.notFound('Fikr topilmadi');
    if (feedback.handledAt) throw AppError.conflict('Bu fikr allaqachon ishlangan deb belgilangan');

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.feedback.update({
        where: { id },
        data: { handledAt: new Date(), handledById: actor.id, handleNote: note },
        select: feedbackSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'feedback.handled',
        entityType: 'student',
        entityId: feedback.studentId,
        metadata: { feedbackId: id, note },
        ...client,
      });
      return record;
    });
    return toDto(updated);
  },

  /** Kabinet uchun: o'quvchi bugun qaysi fikrlarni qoldirgan */
  async pendingForStudent(studentId: string): Promise<{ answeredToday: FeedbackType[] }> {
    const today = await prisma.feedback.findMany({
      where: { studentId, createdAt: { gte: startOfDay(new Date()) } },
      select: { type: true },
    });
    return { answeredToday: today.map((row) => row.type) };
  },
};
