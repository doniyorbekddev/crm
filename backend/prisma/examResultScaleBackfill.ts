import type { PrismaClient } from '../src/generated/prisma/client.js';
import { toExamScale } from '../src/services/examAttempt.service.js';

/**
 * PHASE 15 tuzatishidan oldin onlayn urinish natijasi `ExamResult.score` ga **xom ball** bilan
 * yozilgan (masalan 4 ballik test 100 ballik imtihonda → 4/100, lekin 100%). Bu yozuvlarni
 * imtihon shkalasiga o'tkazadi.
 *
 * Faqat natija o'sha urinishdan kelgani aniq bo'lsa (foizlar teng) o'zgartiriladi; qo'lda kiritilgan
 * natijalarga tegilmaydi. Takror ishga tushirish xavfsiz (idempotent), hech narsa o'chirilmaydi.
 */
export async function backfillExamResultScale(prisma: PrismaClient, apply: boolean): Promise<{ checked: number; changed: number }> {
  const attempts = await prisma.examAttempt.findMany({
    where: { status: 'GRADED' },
    orderBy: [{ examId: 'asc' }, { studentId: 'asc' }, { attemptNo: 'desc' }],
    select: { examId: true, studentId: true, score: true, maxScore: true, percentage: true, exam: { select: { maxScore: true } } },
  });
  // Har (imtihon, o'quvchi) uchun oxirgi baholangan urinish
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const key = `${attempt.examId}:${attempt.studentId}`;
    if (!latest.has(key)) latest.set(key, attempt);
  }

  let changed = 0;
  for (const attempt of latest.values()) {
    const result = await prisma.examResult.findUnique({
      where: { examId_studentId: { examId: attempt.examId, studentId: attempt.studentId } },
      select: { id: true, score: true, percentage: true },
    });
    if (!result || result.percentage !== attempt.percentage) continue;
    const scaled = toExamScale(attempt.score, attempt.maxScore, attempt.exam.maxScore);
    if (result.score === scaled) continue;
    changed += 1;
    if (apply) await prisma.examResult.update({ where: { id: result.id }, data: { score: scaled } });
  }
  return { checked: latest.size, changed };
}
