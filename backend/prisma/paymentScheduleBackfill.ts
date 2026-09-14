import type { PrismaClient } from '../src/generated/prisma/client.js';
import { buildMonthlyPlan } from '../src/utils/paymentSchedule.js';

/**
 * Jadvali yo‘q o‘quvchilarga standart oylik to‘lov jadvali: kurs davomiyligi bo‘yicha, birinchi muddat —
 * o‘qish boshlangan kun. Faqat jadvali yo‘q va shartnomasi noldan katta o‘quvchilarga yoziladi —
 * takror ishga tushirish xavfsiz, qo‘lda tuzilgan jadvallarga tegmaydi.
 */
export async function backfillPaymentSchedules(prisma: PrismaClient): Promise<number> {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, installments: { none: {} }, debt: { totalAmount: { gt: 0 } } },
    select: {
      id: true,
      startDate: true,
      course: { select: { durationMonths: true } },
      debt: { select: { totalAmount: true } },
    },
  });

  let created = 0;
  for (const student of students) {
    if (!student.debt) continue;
    const plan = buildMonthlyPlan(
      student.debt.totalAmount.toNumber(),
      student.course.durationMonths,
      student.startDate.toISOString().slice(0, 10),
    );
    if (plan.length === 0) continue;
    await prisma.paymentInstallment.createMany({
      data: plan.map((item) => ({
        studentId: student.id,
        sequence: item.sequence,
        dueDate: new Date(`${item.dueDate}T00:00:00.000Z`),
        amount: item.amount,
      })),
      skipDuplicates: true,
    });
    created += 1;
  }
  return created;
}
