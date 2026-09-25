import { primaryClientUrl } from '../config/env.js';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';
import { notificationService } from './notification.service.js';

/**
 * O'quvchi va uning ota-onasiga hodisa haqida xabar — **bitta joydan**.
 *
 * Ikki kanal:
 *  - kabinet hisobi bo'lsa (`Student.userId` / `Parent.userId`) — ilova ichida (qo'ng'iroqcha),
 *    bu yerda foydalanuvchining tur bo'yicha sozlamasi ham hisobga olinadi;
 *  - Telegram — `studentId` / `parentId` bo'yicha (hisob shart emas, faqat bog'langan chat).
 *
 * Nega alohida servis: vazifa, imtihon, XP, sertifikat — to'rt xil joyda bir xil "kimga
 * yuborish" mantiqi takrorlanmasin. Chaqiruvchi faqat **id** beradi, matn va manzil shu yerda.
 *
 * Har bir chaqiruv asosiy amal bilan **bir tranzaksiyada** — amal bekor bo'lsa xabar ham ketmaydi.
 */

type Tx = Prisma.TransactionClient;

interface FamilyEvent {
  studentId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  /** Takrorlanmaslik kaliti — qabul qiluvchi bo'yicha suffiks qo'shiladi */
  dedupeKey: string;
  /** Ota-onaga ham yuborilsinmi (XP kabi mayda hodisalar — faqat o'quvchiga) */
  parents: boolean;
  /** O'quvchining o'ziga yuborilsinmi (standart — ha; "faqat ota-onaga" xabarlar uchun false) */
  student?: boolean;
}

/** Nechta qabul qiluvchiga navbatga qo'yildi (ilova ichidagi + Telegram chatlar) */
async function notifyFamily(tx: Tx, event: FamilyEvent): Promise<number> {
  const student = await tx.student.findFirst({
    where: { id: event.studentId, deletedAt: null },
    select: { userId: true, parents: { select: { parent: { select: { id: true, userId: true } } } } },
  });
  if (!student) return 0;

  const includeStudent = event.student ?? true;
  const parentRows = event.parents ? student.parents.map((row) => row.parent) : [];

  // Ilova ichida — hisobi borlarga (sozlama shu yerda tekshiriladi)
  const userIds = [includeStudent ? student.userId : null, ...parentRows.map((parent) => parent.userId)].filter((id): id is string => Boolean(id));
  await notificationService.createManyInTransaction(
    tx,
    userIds.map((userId) => ({
      userId,
      type: event.type,
      title: event.title,
      message: event.message,
      entityType: event.entityType,
      entityId: event.entityId,
      dedupeKey: `${event.dedupeKey}:u:${userId}`,
    })),
  );

  // Telegram — bog'langan chatlarga (kabinet hisobi bo'lmasa ham)
  let queued = userIds.length;
  if (includeStudent) {
    queued += await notificationService.notifyExternalInTransaction(tx, {
      title: event.title,
      message: event.message,
      studentId: event.studentId,
      dedupeKey: `${event.dedupeKey}:s:${event.studentId}`,
    });
  }
  for (const parent of parentRows) {
    queued += await notificationService.notifyExternalInTransaction(tx, {
      title: event.title,
      message: event.message,
      parentId: parent.id,
      dedupeKey: `${event.dedupeKey}:p:${parent.id}`,
    });
  }
  return queued;
}

/** 24.09.2026 */
function dateUz(value: Date): string {
  return `${String(value.getUTCDate()).padStart(2, '0')}.${String(value.getUTCMonth() + 1).padStart(2, '0')}.${value.getUTCFullYear()}`;
}

/** Yangi vazifa e'lon qilindi — guruhdagi barcha faol o'quvchiga (va ota-onasiga) */
export async function notifyHomeworkCreated(tx: Tx, homeworkId: string): Promise<void> {
  const homework = await tx.homework.findUnique({
    where: { id: homeworkId },
    select: { title: true, deadline: true, groupId: true, group: { select: { name: true } } },
  });
  if (!homework) return;
  // Kimga berilgan bo'lsa — faqat o'shalarga (butun guruh, tanlanganlar yoki bitta o'quvchi)
  const students = (await tx.homeworkSubmission.findMany({ where: { homeworkId }, select: { studentId: true } })).map((row) => ({ id: row.studentId }));
  for (const student of students) {
    await notifyFamily(tx, {
      studentId: student.id,
      type: 'HOMEWORK_CREATED',
      title: 'Yangi uy vazifasi',
      message: `${homework.group.name}: «${homework.title}» — muddat ${dateUz(homework.deadline)}.`,
      entityType: 'homework',
      entityId: homeworkId,
      dedupeKey: `homework:created:${homeworkId}`,
      parents: true,
    });
  }
}

/** Vazifa baholandi — ball va izoh bilan. Bir xil ball qayta qo'yilsa takror xabar ketmaydi */
export async function notifyHomeworkGraded(tx: Tx, input: { homeworkId: string; studentId: string; score: number; feedback: string | null }): Promise<void> {
  const homework = await tx.homework.findUnique({ where: { id: input.homeworkId }, select: { title: true, maxPoints: true } });
  if (!homework) return;
  await notifyFamily(tx, {
    studentId: input.studentId,
    type: 'HOMEWORK_GRADED',
    title: 'Vazifa baholandi',
    message: `«${homework.title}»: ${input.score}/${homework.maxPoints} ball${input.feedback ? `. Izoh: ${input.feedback}` : ''}`,
    entityType: 'homework',
    entityId: input.homeworkId,
    dedupeKey: `homework:graded:${input.homeworkId}:${input.studentId}:${input.score}`,
    parents: true,
  });
}

/** Imtihon natijasi (o'qituvchi kiritgan yoki avtomatik baholangan) */
export async function notifyExamResult(tx: Tx, input: { examId: string; studentId: string }): Promise<void> {
  const [exam, result] = await Promise.all([
    tx.exam.findUnique({ where: { id: input.examId }, select: { title: true, maxScore: true } }),
    tx.examResult.findUnique({
      where: { examId_studentId: { examId: input.examId, studentId: input.studentId } },
      select: { score: true, percentage: true, grade: true },
    }),
  ]);
  if (!exam || !result) return;
  await notifyFamily(tx, {
    studentId: input.studentId,
    type: 'EXAM_RESULT',
    title: 'Imtihon natijasi',
    message: `«${exam.title}»: ${result.score}/${exam.maxScore} ball (${result.percentage}%)${result.grade ? `, baho ${result.grade}` : ''}.`,
    entityType: 'exam',
    entityId: input.examId,
    dedupeKey: `exam:result:${input.examId}:${input.studentId}:${result.score}`,
    parents: true,
  });
}

/** Onlayn urinish baholangach — o'quvchi id urinishdan olinadi */
export async function notifyExamResultForAttempt(tx: Tx, attemptId: string): Promise<void> {
  const attempt = await tx.examAttempt.findUnique({ where: { id: attemptId }, select: { examId: true, studentId: true } });
  if (!attempt) return;
  await notifyExamResult(tx, { examId: attempt.examId, studentId: attempt.studentId });
}

/** Yangi daraja — faqat o'quvchining o'ziga (ota-onaga mayda XP xabari shart emas) */
export async function notifyLevelUp(tx: Tx, studentId: string, levelNumber: number): Promise<void> {
  const level = await tx.level.findFirst({ where: { number: levelNumber }, select: { name: true, icon: true } });
  await notifyFamily(tx, {
    studentId,
    type: 'LEVEL_UP',
    title: 'Yangi daraja!',
    message: `Tabriklaymiz — siz ${levelNumber}-darajaga ko‘tarildingiz${level ? `: ${level.icon ?? ''} «${level.name}»` : ''}.`,
    entityType: 'student',
    entityId: studentId,
    dedupeKey: `level:${studentId}:${levelNumber}`,
    parents: false,
  });
}

/** Sertifikat berildi — tekshiruv havolasi bilan */
export async function notifyCertificateIssued(tx: Tx, certificateId: string): Promise<void> {
  const certificate = await tx.certificate.findUnique({
    where: { id: certificateId },
    select: { studentId: true, courseName: true, verifyToken: true },
  });
  if (!certificate) return;
  await notifyFamily(tx, {
    studentId: certificate.studentId,
    type: 'CERTIFICATE_ISSUED',
    title: 'Sertifikat berildi',
    message: `«${certificate.courseName}» kursi uchun sertifikat tayyor. Tekshirish: ${primaryClientUrl}/verify/${certificate.verifyToken}`,
    entityType: 'certificate',
    entityId: certificateId,
    dedupeKey: `certificate:${certificateId}`,
    parents: true,
  });
}

/**
 * Avtomatlashtirish qoidalari uchun: xabar o'quvchining o'ziga (`STUDENT`) yoki ota-onasiga
 * (`PARENT`) — ilova ichida va Telegramda. Oldin faqat o'quvchining Telegramiga ketardi,
 * shuning uchun "ota-onaga" deb sozlangan qoida ota-onaga yetib bormasdi.
 */
export async function notifyStudentAudience(
  tx: Tx,
  input: {
    studentId: string;
    audience: 'STUDENT' | 'PARENT';
    type: NotificationType;
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    dedupeKey: string;
  },
): Promise<number> {
  return notifyFamily(tx, {
    studentId: input.studentId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    dedupeKey: input.dedupeKey,
    student: input.audience === 'STUDENT',
    parents: input.audience === 'PARENT',
  });
}

/** Haftalik hisobot — o'quvchi va ota-onaga (TZ 3.0 §11) */
export async function notifyWeeklyReport(tx: Tx, input: { studentId: string; weekStart: string; weekLabel: string; summary: string[] }): Promise<number> {
  return notifyFamily(tx, {
    studentId: input.studentId,
    type: 'WEEKLY_REPORT',
    title: `Haftalik hisobot · ${input.weekLabel}`,
    message: input.summary.join('\n'),
    entityType: 'weekly_report',
    entityId: input.weekStart,
    dedupeKey: `weekly-report:${input.studentId}:${input.weekStart}`,
    parents: true,
  });
}

/** O'qituvchi ishni qayta ishlashga qaytardi — izoh bilan (o'quvchi va ota-onaga) */
export async function notifyHomeworkReturned(tx: Tx, input: { homeworkId: string; studentId: string; feedback: string }): Promise<void> {
  const homework = await tx.homework.findUnique({ where: { id: input.homeworkId }, select: { title: true } });
  if (!homework) return;
  await notifyFamily(tx, {
    studentId: input.studentId,
    type: 'HOMEWORK_RETURNED',
    title: 'Vazifa qayta ishlashga qaytarildi',
    message: `«${homework.title}»: ${input.feedback}`,
    entityType: 'homework',
    entityId: input.homeworkId,
    dedupeKey: `homework:returned:${input.homeworkId}:${input.studentId}:${Date.now()}`,
    parents: true,
  });
}

/** Muddatga 24 soatdan kam qoldi — hali topshirmagan o'quvchi (va ota-onasi)ga bir marta */
export async function notifyHomeworkDeadline(tx: Tx, input: { homeworkId: string; studentId: string; title: string; deadline: Date }): Promise<number> {
  return notifyFamily(tx, {
    studentId: input.studentId,
    type: 'HOMEWORK_DEADLINE',
    title: 'Vazifa muddati yaqinlashdi',
    message: `«${input.title}» — muddat ${dateUz(input.deadline)}. Hali topshirilmagan.`,
    entityType: 'homework',
    entityId: input.homeworkId,
    dedupeKey: `homework:deadline:${input.homeworkId}:${input.studentId}`,
    parents: true,
  });
}
