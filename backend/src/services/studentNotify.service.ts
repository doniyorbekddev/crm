import { env, primaryClientUrl } from '../config/env.js';
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
  /** Kanal cheklovi (avtomatlashtirish qoidasi): standart — ikkalasi */
  channels?: { inApp: boolean; telegram: boolean };
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
  const channels = event.channels ?? { inApp: true, telegram: true };
  const userIds = [includeStudent ? student.userId : null, ...parentRows.map((parent) => parent.userId)].filter((id): id is string => Boolean(id));
  if (!channels.inApp && !channels.telegram) return 0;
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
    // Kabinet hisobining Telegrami pastda (studentId/parentId bo'yicha) — bu yerda faqat ilova
    { inApp: channels.inApp, telegram: false },
  );

  // Telegram — bog'langan chatlarga (kabinet hisobi bo'lmasa ham)
  let queued = channels.inApp ? userIds.length : 0;
  if (!channels.telegram) return queued;
  if (includeStudent) {
    queued += await notificationService.notifyExternalInTransaction(tx, {
      type: event.type,
      title: event.title,
      message: event.message,
      studentId: event.studentId,
      dedupeKey: `${event.dedupeKey}:s:${event.studentId}`,
    });
  }
  for (const parent of parentRows) {
    queued += await notificationService.notifyExternalInTransaction(tx, {
      type: event.type,
      title: event.title,
      message: event.message,
      parentId: parent.id,
      dedupeKey: `${event.dedupeKey}:p:${parent.id}`,
    });
  }
  return queued;
}

/** Shu foizdan past natija — "past baho" hodisasi (vazifa uchun 50%) */
const LOW_SCORE_PERCENT = 60;

/**
 * TZ 3.0 §42 "Low score": faqat ota-onaga (o'quvchi natijani o'zi oladi), qo'rqitmaydigan ohangda
 * va amaliy tavsiya bilan. Bir natija uchun bir marta (ball o'zgarsa — yangi xabar).
 */
export async function notifyLowScore(
  tx: Tx,
  input: { studentId: string; kind: 'exam' | 'homework'; entityId: string; title: string; percent: number; marker: string },
): Promise<number> {
  const what = input.kind === 'exam' ? 'imtihonida' : 'vazifasida';
  return notifyFamily(tx, {
    studentId: input.studentId,
    type: 'LOW_SCORE',
    title: 'Natija bo‘yicha qo‘llab-quvvatlash',
    message: `«${input.title}» ${what} ${input.percent}% natija. Mavzuni kabinetdagi materiallar bilan birga takrorlash va o‘qituvchi bilan maslahatlashish foydali bo‘ladi.`,
    entityType: input.kind,
    entityId: input.entityId,
    dedupeKey: `low-score:${input.kind}:${input.entityId}:${input.studentId}:${input.marker}`,
    parents: true,
    student: false,
  });
}

/** TZ §42 "Exam scheduled": guruhdagi faol o'quvchi va ota-onasiga; sana o'zgarsa — qayta */
export async function notifyExamScheduled(tx: Tx, examId: string): Promise<number> {
  const exam = await tx.exam.findUnique({
    where: { id: examId },
    select: { title: true, date: true, status: true, isOnline: true, startAt: true, groupId: true, group: { select: { name: true } } },
  });
  if (!exam || exam.status !== 'PLANNED') return 0;
  const students = await tx.student.findMany({ where: { groupId: exam.groupId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
  // Oyna berilgan bo'lsa — o'quv markaz vaqtidagi boshlanish soati bilan
  const local = exam.startAt ? new Date(exam.startAt.getTime() + env.APP_UTC_OFFSET_MINUTES * 60_000) : null;
  const whenLocal = local ? `${dateUz(local)} ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}` : dateUz(exam.date);
  let sent = 0;
  for (const student of students) {
    sent += await notifyFamily(tx, {
      studentId: student.id,
      type: 'EXAM_SCHEDULED',
      title: 'Imtihon rejalashtirildi',
      message: `${exam.group.name}: «${exam.title}» — ${whenLocal}${exam.isOnline ? '. Kabinetdan onlayn topshiriladi' : ''}.`,
      entityType: 'exam',
      entityId: examId,
      dedupeKey: `exam:scheduled:${examId}:${businessDay(exam.date)}:${exam.startAt?.toISOString() ?? ''}`,
      parents: true,
    });
  }
  return sent;
}

/** TZ §42 "Attendance late": faqat ota-onaga, yumshoq */
export async function notifyAttendanceLate(tx: Tx, input: { attendanceId: string; studentId: string; groupName: string; date: Date }): Promise<number> {
  return notifyFamily(tx, {
    studentId: input.studentId,
    type: 'ATTENDANCE_LATE',
    title: 'Darsga kechikib keldi',
    message: `${input.groupName} guruhidagi ${dateUz(input.date)} kungi darsga kechikib keldi.`,
    entityType: 'attendance',
    entityId: input.attendanceId,
    dedupeKey: `attendance:late:${input.attendanceId}`,
    parents: true,
    student: false,
  });
}

function businessDay(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  const percent = Math.round((input.score / Math.max(1, homework.maxPoints)) * 100);
  if (percent < LOW_SCORE_PERCENT / 1.2) {
    await notifyLowScore(tx, { studentId: input.studentId, kind: 'homework', entityId: input.homeworkId, title: homework.title, percent, marker: String(input.score) });
  }
}

/** Imtihon natijasi (o'qituvchi kiritgan yoki avtomatik baholangan) */
export async function notifyExamResult(tx: Tx, input: { examId: string; studentId: string }): Promise<void> {
  const [exam, result] = await Promise.all([
    tx.exam.findUnique({ where: { id: input.examId }, select: { title: true, maxScore: true, passScore: true } }),
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
  // Past natija — ota-onaga yumshoq tavsiya bilan (o'tish balidan past yoki 60% dan kam)
  const passed = exam.passScore === null ? result.percentage >= LOW_SCORE_PERCENT : result.score >= exam.passScore;
  if (!passed) {
    await notifyLowScore(tx, { studentId: input.studentId, kind: 'exam', entityId: input.examId, title: exam.title, percent: result.percentage, marker: String(result.score) });
  }
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
    channels?: { inApp: boolean; telegram: boolean };
  },
): Promise<number> {
  return notifyFamily(tx, {
    ...(input.channels ? { channels: input.channels } : {}),
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
