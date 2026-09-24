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
}

async function notifyFamily(tx: Tx, event: FamilyEvent): Promise<void> {
  const student = await tx.student.findFirst({
    where: { id: event.studentId, deletedAt: null },
    select: { userId: true, parents: { select: { parent: { select: { id: true, userId: true } } } } },
  });
  if (!student) return;

  const parentRows = event.parents ? student.parents.map((row) => row.parent) : [];

  // Ilova ichida — hisobi borlarga (sozlama shu yerda tekshiriladi)
  const userIds = [student.userId, ...parentRows.map((parent) => parent.userId)].filter((id): id is string => Boolean(id));
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
  await notificationService.notifyExternalInTransaction(tx, {
    title: event.title,
    message: event.message,
    studentId: event.studentId,
    dedupeKey: `${event.dedupeKey}:s:${event.studentId}`,
  });
  for (const parent of parentRows) {
    await notificationService.notifyExternalInTransaction(tx, {
      title: event.title,
      message: event.message,
      parentId: parent.id,
      dedupeKey: `${event.dedupeKey}:p:${parent.id}`,
    });
  }
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
  const students = await tx.student.findMany({ where: { groupId: homework.groupId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
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
