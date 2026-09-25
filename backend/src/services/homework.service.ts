import { prisma } from '../config/database.js';
import { formatStudentNumber } from '../config/studentLabels.js';
import type { HomeworkStatus, HomeworkTarget, Prisma, QuestionDifficulty, SubmissionStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, removeStoredFile, resolveStoredPath, sanitizeFileName, saveFile } from '../utils/fileStorage.js';
import { toSkipTake } from '../utils/pagination.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type {
  BulkGradeInput,
  CreateHomeworkInput,
  GradeSubmissionInput,
  HomeworkLinkInput,
  HomeworkListQuery,
  ReturnSubmissionInput,
  RubricCriterion,
  UpdateHomeworkInput,
} from '../validators/homework.validator.js';
import { auditService } from './audit.service.js';
import { notifyHomeworkCreated, notifyHomeworkGraded, notifyHomeworkReturned } from './studentNotify.service.js';
import { gamificationHooks } from './gamification.service.js';
import { assertGroupVisible, getTeachingAccess } from './teachingAccess.js';
import type { TeachingAccess } from './teachingAccess.js';

// Egalik qoidasi endi `teachingAccess.ts` da — eski importlar ishlashi uchun qayta eksport
export { assertGroupVisible, getTeachingAccess } from './teachingAccess.js';
export type { TeachingAccess } from './teachingAccess.js';

/**
 * Uy vazifasi (TZ 3.0 §15–20).
 *
 * - **Kimga**: butun guruh (`GROUP` — keyin qo'shilganlar ham oladi), tanlanganlar yoki bitta
 *   o'quvchi. Nishon o'quvchilar = topshiriq yozuvlari (`HomeworkSubmission`).
 * - **Holatlar**: PENDING (boshlanmagan) → IN_PROGRESS (qoralama/fayl) → SUBMITTED/LATE →
 *   GRADED (tekshirildi) yoki RETURNED (qayta ishlashga) → yana SUBMITTED. MISSED — muddat o'tdi.
 * - **Javob**: matn, havola, kod va bir nechta fayl (fayl siyosati hujjatlar bilan bir xil).
 * - **Baholash**: to'g'ridan-to'g'ri ball yoki rubrika (mezon × og'irlik) — ball serverda hisoblanadi.
 *   O'qituvchi yakuniy baho beruvchi (AI faqat tavsiya — PHASE 9).
 */

/** Bir topshiriqqa biriktiriladigan fayllar soni (o'quvchi) */
export const MAX_SUBMISSION_FILES = 5;
/** O'quvchi o'zgartira oladigan holatlar (baholangandan keyin — yo'q) */
const STUDENT_EDITABLE: readonly SubmissionStatus[] = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'LATE', 'RETURNED', 'MISSED'];
const SUBMITTED_STATUSES: readonly SubmissionStatus[] = ['SUBMITTED', 'LATE', 'GRADED'];

// ---------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------

export interface AttachmentDto {
  id: string;
  kind: 'FILE' | 'LINK' | 'VIDEO';
  title: string;
  url: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface RubricDto {
  id: string;
  name: string;
  description: string | null;
  criteria: RubricCriterion[];
  isActive: boolean;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface HomeworkDto {
  id: string;
  title: string;
  description: string | null;
  status: HomeworkStatus;
  assignedAt: string;
  deadline: string;
  maxPoints: number;
  xpReward: number;
  attachmentPath: string | null;
  targetType: HomeworkTarget;
  difficulty: QuestionDifficulty | null;
  topic: { id: string; title: string } | null;
  lesson: { id: string; title: string } | null;
  rubric: { id: string; name: string } | null;
  attachmentCount: number;
  /** Muddati o‘tgan va yopilmagan */
  isOverdue: boolean;
  course: { id: string; name: string } | null;
  group: { id: string; name: string };
  teacher: { id: string; firstName: string; lastName: string } | null;
  stats: {
    students: number;
    submitted: number;
    graded: number;
    pending: number;
    missed: number;
    returned: number;
    /** Topshirganlar ulushi (%) */
    submissionRate: number;
    averageScore: number;
  };
}

export interface SubmissionDto {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  xpAwarded: number;
  gradedBy: { id: string; firstName: string; lastName: string } | null;
  gradedAt: string | null;
  /** Nima topshirilgan — ro'yxatda belgi uchun */
  hasText: boolean;
  hasLink: boolean;
  hasCode: boolean;
  fileCount: number;
}

export interface HomeworkDetailDto extends HomeworkDto {
  submissions: SubmissionDto[];
  attachments: AttachmentDto[];
  rubricCriteria: RubricCriterion[] | null;
}

/** O'qituvchi bitta topshiriqni ochganda — to'liq javob (TZ §19) */
export interface SubmissionDetailDto extends SubmissionDto {
  homeworkId: string;
  late: boolean;
  answerText: string | null;
  linkUrl: string | null;
  codeText: string | null;
  codeLanguage: string | null;
  rubricScores: Record<string, number> | null;
  returnedAt: string | null;
  files: Array<{ id: string; originalName: string; mimeType: string; size: number; createdAt: string }>;
}

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

const attachmentSelect = {
  id: true,
  kind: true,
  title: true,
  url: true,
  originalName: true,
  mimeType: true,
  size: true,
} satisfies Prisma.HomeworkAttachmentSelect;

const homeworkSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  assignedAt: true,
  deadline: true,
  maxPoints: true,
  xpReward: true,
  attachmentPath: true,
  targetType: true,
  difficulty: true,
  topic: { select: { id: true, title: true } },
  lesson: { select: { id: true, title: true } },
  rubric: { select: { id: true, name: true, criteria: true } },
  _count: { select: { attachments: true } },
  course: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, courseId: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  submissions: {
    select: {
      status: true,
      score: true,
      submittedAt: true,
      feedback: true,
      xpAwarded: true,
      gradedAt: true,
      answerText: true,
      linkUrl: true,
      codeText: true,
      _count: { select: { attachments: true } },
      gradedBy: { select: { id: true, firstName: true, lastName: true } },
      student: { select: { id: true, number: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.HomeworkSelect;

type HomeworkRecord = Prisma.HomeworkGetPayload<{ select: typeof homeworkSelect }>;

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 86_400_000);
}

function parseCriteria(raw: unknown): RubricCriterion[] {
  return Array.isArray(raw) ? (raw as RubricCriterion[]) : [];
}

function toDto(homework: HomeworkRecord): HomeworkDto {
  const submissions = homework.submissions;
  const submitted = submissions.filter((row) => SUBMITTED_STATUSES.includes(row.status)).length;
  const graded = submissions.filter((row) => row.status === 'GRADED').length;
  const missed = submissions.filter((row) => row.status === 'MISSED').length;
  const scores = submissions.flatMap((row) => (row.score === null ? [] : [row.score]));

  return {
    id: homework.id,
    title: homework.title,
    description: homework.description,
    status: homework.status,
    assignedAt: homework.assignedAt.toISOString(),
    deadline: homework.deadline.toISOString(),
    maxPoints: homework.maxPoints,
    xpReward: homework.xpReward,
    attachmentPath: homework.attachmentPath,
    targetType: homework.targetType,
    difficulty: homework.difficulty,
    topic: homework.topic,
    lesson: homework.lesson,
    rubric: homework.rubric ? { id: homework.rubric.id, name: homework.rubric.name } : null,
    attachmentCount: homework._count.attachments,
    isOverdue: homework.status !== 'CLOSED' && homework.deadline.getTime() < Date.now(),
    course: homework.course,
    group: { id: homework.group.id, name: homework.group.name },
    teacher: homework.teacher,
    stats: {
      students: submissions.length,
      submitted,
      graded,
      pending: submissions.filter((row) => row.status === 'PENDING' || row.status === 'IN_PROGRESS').length,
      missed,
      returned: submissions.filter((row) => row.status === 'RETURNED').length,
      submissionRate: submissions.length === 0 ? 0 : Math.round((submitted / submissions.length) * 100),
      averageScore: scores.length === 0 ? 0 : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    },
  };
}

function toSubmissionDto(row: HomeworkRecord['submissions'][number]): SubmissionDto {
  return {
    studentId: row.student.id,
    code: formatStudentNumber(row.student.number),
    firstName: row.student.firstName,
    lastName: row.student.lastName,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    score: row.score,
    feedback: row.feedback,
    xpAwarded: row.xpAwarded,
    gradedBy: row.gradedBy,
    gradedAt: row.gradedAt?.toISOString() ?? null,
    hasText: Boolean(row.answerText),
    hasLink: Boolean(row.linkUrl),
    hasCode: Boolean(row.codeText),
    fileCount: row._count.attachments,
  };
}

async function toDetailDto(homework: HomeworkRecord): Promise<HomeworkDetailDto> {
  const attachments = await prisma.homeworkAttachment.findMany({
    where: { homeworkId: homework.id },
    orderBy: { createdAt: 'asc' },
    select: attachmentSelect,
  });
  return {
    ...toDto(homework),
    attachments,
    rubricCriteria: homework.rubric ? parseCriteria(homework.rubric.criteria) : null,
    submissions: homework.submissions
      .map(toSubmissionDto)
      .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)),
  };
}

/**
 * Nishon o'quvchilarga bo'sh topshiriq ochiladi: `GROUP` — guruhning barcha faol o'quvchisi,
 * aks holda — tanlanganlar (guruh a'zosi va faol ekani oldin tekshirilgan).
 */
async function ensureSubmissions(tx: Prisma.TransactionClient, homeworkId: string, groupId: string, studentIds?: string[]): Promise<number> {
  const students = studentIds
    ? studentIds.map((id) => ({ id }))
    : await tx.student.findMany({ where: { groupId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
  if (students.length === 0) return 0;

  await tx.homeworkSubmission.createMany({
    data: students.map((student) => ({ homeworkId, studentId: student.id })),
    skipDuplicates: true,
  });
  return students.length;
}

/**
 * Guruhga keyin qo'shilgan o'quvchi (yangi yoki boshqa guruhdan o'tgan) — guruhning hali muddati
 * o'tmagan, butun guruhga berilgan vazifalarini oladi. `recordGroupChange` dan chaqiriladi.
 */
export async function attachOpenGroupHomework(tx: Prisma.TransactionClient, studentId: string, groupId: string, now: Date = new Date()): Promise<number> {
  const open = await tx.homework.findMany({
    where: { groupId, status: 'PUBLISHED', targetType: 'GROUP', deadline: { gte: now } },
    select: { id: true },
  });
  if (open.length === 0) return 0;
  const result = await tx.homeworkSubmission.createMany({
    data: open.map((homework) => ({ homeworkId: homework.id, studentId })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Tanlangan o'quvchilar guruhda va faolmi */
async function assertTargets(groupId: string, studentIds: string[]): Promise<void> {
  const unique = [...new Set(studentIds)];
  const found = await prisma.student.count({ where: { id: { in: unique }, groupId, deletedAt: null, status: 'ACTIVE' } });
  if (found !== unique.length || unique.length !== studentIds.length) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'studentIds', message: 'O‘quvchilar shu guruhning faol a’zosi bo‘lishi kerak' }]);
  }
}

/** Mavzu va dars guruh kursiga tegishlimi; rubrika faolmi */
async function assertLinks(courseId: string, input: { topicId?: string | null; lessonId?: string | null; rubricId?: string | null }): Promise<void> {
  if (input.topicId) {
    const topic = await prisma.courseTopic.findFirst({ where: { id: input.topicId, module: { courseId } }, select: { id: true } });
    if (!topic) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'topicId', message: 'Mavzu bu guruh kursiga tegishli emas' }]);
  }
  if (input.lessonId) {
    const lesson = await prisma.lesson.findFirst({
      where: { id: input.lessonId, topic: { module: { courseId } }, ...(input.topicId ? { topicId: input.topicId } : {}) },
      select: { id: true },
    });
    if (!lesson) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'lessonId', message: 'Dars bu kurs (mavzu) ga tegishli emas' }]);
  }
  if (input.rubricId) {
    const rubric = await prisma.rubric.findFirst({ where: { id: input.rubricId, isActive: true }, select: { id: true } });
    if (!rubric) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'rubricId', message: 'Rubrika topilmadi' }]);
  }
}

function buildWhere(access: TeachingAccess, query: HomeworkListQuery): Prisma.HomeworkWhereInput {
  const conditions: Prisma.HomeworkWhereInput[] = [];
  if (access.onlyOwnGroups) conditions.push({ group: { teacherId: access.userId } });
  if (query.groupId) conditions.push({ groupId: query.groupId });
  if (query.courseId) conditions.push({ courseId: query.courseId });
  if (query.teacherId) conditions.push({ OR: [{ teacherId: query.teacherId }, { group: { teacherId: query.teacherId } }] });
  if (query.status) conditions.push({ status: query.status });
  if (query.from) conditions.push({ deadline: { gte: dayStart(query.from) } });
  if (query.to) conditions.push({ deadline: { lt: nextDayStart(query.to) } });

  const search = query.search?.trim();
  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { group: { name: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  return { AND: conditions };
}

async function findVisible(access: TeachingAccess, id: string): Promise<HomeworkRecord> {
  const homework = await prisma.homework.findFirst({
    where: { id, ...(access.onlyOwnGroups ? { group: { teacherId: access.userId } } : {}) },
    select: homeworkSelect,
  });
  if (!homework) {
    throw AppError.notFound('Uy vazifasi topilmadi');
  }
  return homework;
}

/** Ball qo‘yilsa holat GRADED bo‘ladi; muddatdan keyin topshirilsa — LATE */
function resolveStatus(
  current: SubmissionStatus,
  input: { status?: SubmissionStatus; score?: number },
  deadlinePassed: boolean,
): SubmissionStatus {
  if (input.status) return input.status;
  if (input.score !== undefined) return 'GRADED';
  if (current === 'PENDING') return deadlinePassed ? 'LATE' : 'SUBMITTED';
  return current;
}

/**
 * Rubrika bo'yicha ball: Σ(og'irlik × foiz) / 100 → maxPoints ga moslanadi.
 * Barcha mezonlar baholanishi shart — qisman rubrika noaniq ball beradi.
 */
export function scoreFromRubric(criteria: RubricCriterion[], scores: Record<string, number>, maxPoints: number): number {
  const missing = criteria.filter((criterion) => scores[criterion.key] === undefined);
  if (missing.length > 0) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'rubricScores', message: `Baholanmagan mezon: ${missing.map((item) => item.title).join(', ')}` }]);
  }
  const unknown = Object.keys(scores).filter((key) => !criteria.some((criterion) => criterion.key === key));
  if (unknown.length > 0) {
    throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'rubricScores', message: `Rubrikada yo‘q mezon: ${unknown.join(', ')}` }]);
  }
  const percent = criteria.reduce((sum, criterion) => sum + criterion.weight * scores[criterion.key]!, 0) / 100;
  return Math.round((percent / 100) * maxPoints);
}

/** Topshiriq yozuvi — o'quvchi uchun (egalik: yozuv faqat nishon o'quvchida bor) */
async function findOwnSubmission(studentId: string, homeworkId: string) {
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    select: {
      id: true,
      status: true,
      answerText: true,
      linkUrl: true,
      codeText: true,
      attachmentPath: true,
      _count: { select: { attachments: true } },
      homework: { select: { title: true, deadline: true, status: true, group: { select: { name: true } } } },
    },
  });
  if (!submission) throw AppError.notFound('Vazifa topilmadi');
  return submission;
}

function assertStudentCanEdit(submission: { status: SubmissionStatus; homework: { status: HomeworkStatus } }): void {
  if (submission.homework.status !== 'PUBLISHED') throw AppError.unprocessable('Bu vazifa yopilgan, topshirib bo‘lmaydi');
  if (!STUDENT_EDITABLE.includes(submission.status)) throw AppError.unprocessable('Vazifa allaqachon baholangan');
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

export interface StudentSubmitInput {
  answerText?: string | null;
  attachmentPath?: string | null;
  linkUrl?: string | null;
  codeText?: string | null;
  codeLanguage?: string | null;
  /** Qayerdan topshirildi — audit uchun */
  source: 'telegram' | 'portal';
}

export interface StudentSubmitResult {
  status: SubmissionStatus;
  submittedAt: string;
  late: boolean;
  xpAwarded: number;
}

export type StudentDraftInput = Pick<StudentSubmitInput, 'answerText' | 'linkUrl' | 'codeText' | 'codeLanguage'>;

/** Faqat berilgan maydonlar yangilanadi; bo'sh satr — tozalash */
function contentData(input: StudentDraftInput): Prisma.HomeworkSubmissionUpdateInput {
  const clean = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() ? value : null);
  return {
    ...(input.answerText === undefined ? {} : { answerText: clean(input.answerText)?.trim() ?? null }),
    ...(input.linkUrl === undefined ? {} : { linkUrl: clean(input.linkUrl) ?? null }),
    ...(input.codeText === undefined ? {} : { codeText: clean(input.codeText) ?? null }),
    ...(input.codeLanguage === undefined ? {} : { codeLanguage: clean(input.codeLanguage)?.trim() ?? null }),
  };
}

export const homeworkService = {
  /**
   * O'quvchi vazifani **o'zi** topshiradi (Telegram yoki kabinet).
   *
   * Ruxsat tekshirmaydi: `studentId` chaqiruvchi tomonda egalik bilan aniqlangan bo'lishi
   * shart. Egalik shu yerda ham tabiiy: topshiriq yozuvi faqat nishon o'quvchilar uchun ochiladi,
   * shuning uchun begona vazifaga `homeworkId` bilan ham yetib bo'lmaydi.
   *
   * Qoidalar:
   *  - muddatdan keyin topshirish mumkin, lekin holat LATE bo'ladi — o'qituvchi ko'radi;
   *  - qaytarilgan (RETURNED) ish qayta topshirilsa — SUBMITTED (qayta ishlash kechikish emas);
   *  - baholangan ish qayta topshirilmaydi: baho eskicha qolib javob almashsa chalkashlik;
   *  - javob bo'sh bo'lmasligi kerak: matn, havola, kod yoki kamida bitta fayl;
   *  - XP bu yerda hisoblanmaydi — mavjud gamifikatsiya hook'i chaqiriladi.
   */
  async submitByStudent(studentId: string, homeworkId: string, input: StudentSubmitInput, now: Date = new Date()): Promise<StudentSubmitResult> {
    const submission = await findOwnSubmission(studentId, homeworkId);
    assertStudentCanEdit(submission);

    const attachmentPath = input.attachmentPath ?? null;
    const data = contentData(input);
    const pick = <T>(key: keyof typeof data, current: T): T | null => (key in data ? ((data[key] as T | null) ?? null) : current);
    const hasContent =
      Boolean(pick('answerText', submission.answerText)) ||
      Boolean(pick('linkUrl', submission.linkUrl)) ||
      Boolean(pick('codeText', submission.codeText)) ||
      attachmentPath !== null ||
      submission._count.attachments > 0;
    if (!hasContent) {
      throw AppError.unprocessable('Javob matni, havola, kod yoki fayl kerak', [{ field: 'answerText', message: 'Javobni kiriting' }]);
    }

    const late = submission.status !== 'RETURNED' && submission.homework.deadline.getTime() < now.getTime();
    const status: SubmissionStatus = late ? 'LATE' : 'SUBMITTED';

    const xpAwarded = await prisma.$transaction(async (tx) => {
      await tx.homeworkSubmission.update({
        where: { id: submission.id },
        data: { ...data, status, submittedAt: now, ...(attachmentPath === null ? {} : { attachmentPath }) },
      });
      // Bitta fayl bilan topshirish (Telegram, eski kabinet endpointi) — umumiy fayllar ro'yxatiga ham
      if (attachmentPath !== null) {
        await tx.submissionAttachment.create({
          data: {
            submissionId: submission.id,
            storagePath: attachmentPath,
            originalName: `javob.${attachmentPath.split('.').pop() ?? 'bin'}`,
            mimeType: mimeForPath(attachmentPath),
            size: 0,
          },
        });
      }

      // dedupeKey bilan — qayta topshirilsa yoki keyin baholansa ikki marta berilmaydi
      const points = await gamificationHooks.onHomeworkSubmitted(tx, { studentId, submissionId: submission.id, onTime: !late });
      await tx.homeworkSubmission.update({ where: { id: submission.id }, data: { xpAwarded: points } });

      await auditService.recordInTransaction(tx, {
        userId: null,
        action: 'homework.submitted',
        entityType: 'homework',
        entityId: homeworkId,
        metadata: {
          studentId,
          title: submission.homework.title,
          group: submission.homework.group.name,
          late,
          resubmitted: submission.status === 'RETURNED',
          source: input.source,
          hasAttachment: attachmentPath !== null || submission._count.attachments > 0,
        },
        ip: null,
        userAgent: null,
      });
      return points;
    });

    return { status, submittedAt: now.toISOString(), late, xpAwarded };
  },

  /** Qoralama saqlash — topshirilmaydi, holat IN_PROGRESS (TZ §17). Topshirilgan ishda — javob yangilanadi */
  async saveDraft(studentId: string, homeworkId: string, input: StudentDraftInput): Promise<{ status: SubmissionStatus }> {
    const submission = await findOwnSubmission(studentId, homeworkId);
    assertStudentCanEdit(submission);
    const status: SubmissionStatus = submission.status === 'PENDING' || submission.status === 'MISSED' ? 'IN_PROGRESS' : submission.status;
    await prisma.homeworkSubmission.update({ where: { id: submission.id }, data: { ...contentData(input), status } });
    return { status };
  },

  /** O'quvchi fayl qo'shadi (topshirmasdan). Ko'pi bilan 5 ta; tur baytlar bo'yicha */
  async addStudentFile(
    studentId: string,
    homeworkId: string,
    file: { buffer: unknown; fileName: string | undefined },
  ): Promise<{ id: string; originalName: string; mimeType: string; size: number; status: SubmissionStatus }> {
    const submission = await findOwnSubmission(studentId, homeworkId);
    assertStudentCanEdit(submission);
    if (submission._count.attachments >= MAX_SUBMISSION_FILES) {
      throw AppError.unprocessable(`Ko‘pi bilan ${MAX_SUBMISSION_FILES} ta fayl biriktiriladi`);
    }
    const { storagePath, originalName, mimeType, size } = await storeUpload(file);
    const status: SubmissionStatus = submission.status === 'PENDING' || submission.status === 'MISSED' ? 'IN_PROGRESS' : submission.status;
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.submissionAttachment.create({
        data: { submissionId: submission.id, storagePath, originalName, mimeType, size },
        select: { id: true },
      });
      await tx.homeworkSubmission.update({ where: { id: submission.id }, data: { status } });
      return row;
    });
    return { id: created.id, originalName, mimeType, size, status };
  },

  async removeStudentFile(studentId: string, homeworkId: string, fileId: string): Promise<void> {
    const submission = await findOwnSubmission(studentId, homeworkId);
    assertStudentCanEdit(submission);
    const file = await prisma.submissionAttachment.findFirst({ where: { id: fileId, submissionId: submission.id }, select: { id: true, storagePath: true } });
    if (!file) throw AppError.notFound('Fayl topilmadi');
    await prisma.submissionAttachment.delete({ where: { id: file.id } });
    // Eski ustun shu faylga ishora qilsa — tozalanadi
    await prisma.homeworkSubmission.updateMany({ where: { id: submission.id, attachmentPath: file.storagePath }, data: { attachmentPath: null } });
    await removeStoredFile(file.storagePath).catch(() => undefined);
  },

  /** O'quvchi o'z faylini oladi */
  async studentFile(studentId: string, homeworkId: string, fileId: string): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const file = await prisma.submissionAttachment.findFirst({
      where: { id: fileId, submission: { homeworkId, studentId } },
      select: { storagePath: true, originalName: true, mimeType: true },
    });
    if (!file) throw AppError.notFound('Fayl topilmadi');
    return { absolutePath: resolveStoredPath(file.storagePath), fileName: file.originalName, mimeType: file.mimeType };
  },

  /** O'qituvchi biriktirgan fayl — faqat vazifa nishonidagi o'quvchiga */
  async homeworkFileForStudent(studentId: string, homeworkId: string, attachmentId: string): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const attachment = await prisma.homeworkAttachment.findFirst({
      where: { id: attachmentId, homeworkId, homework: { status: { not: 'DRAFT' }, submissions: { some: { studentId } } } },
      select: { storagePath: true, originalName: true, mimeType: true },
    });
    if (!attachment?.storagePath) throw AppError.notFound('Fayl topilmadi');
    return { absolutePath: resolveStoredPath(attachment.storagePath), fileName: attachment.originalName ?? 'fayl', mimeType: attachment.mimeType ?? 'application/octet-stream' };
  },

  /** Kabinet uchun: vazifa biriktirmalari va topshiriqdagi fayllar */
  async studentView(studentId: string, homeworkId: string) {
    const [attachments, files, submission] = await Promise.all([
      prisma.homeworkAttachment.findMany({ where: { homeworkId }, orderBy: { createdAt: 'asc' }, select: attachmentSelect }),
      prisma.submissionAttachment.findMany({
        where: { submission: { homeworkId, studentId } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
      }),
      prisma.homeworkSubmission.findUnique({
        where: { homeworkId_studentId: { homeworkId, studentId } },
        select: { linkUrl: true, codeText: true, codeLanguage: true, rubricScores: true, returnedAt: true, homework: { select: { rubric: { select: { criteria: true } } } } },
      }),
    ]);
    return {
      attachments,
      files: files.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
      linkUrl: submission?.linkUrl ?? null,
      codeText: submission?.codeText ?? null,
      codeLanguage: submission?.codeLanguage ?? null,
      returnedAt: submission?.returnedAt?.toISOString() ?? null,
      rubric: submission?.homework.rubric
        ? { criteria: parseCriteria(submission.homework.rubric.criteria), scores: (submission.rubricScores as Record<string, number> | null) ?? null }
        : null,
    };
  },

  async list(actor: AuthUser, query: HomeworkListQuery): Promise<{ items: HomeworkDto[]; total: number }> {
    const access = await getTeachingAccess(actor);
    const where = buildWhere(access, query);
    const items = await prisma.homework.findMany({
      where,
      select: homeworkSelect,
      orderBy:
        query.sortBy === 'title'
          ? [{ title: query.sortOrder }]
          : query.sortBy === 'assignedAt'
            ? [{ assignedAt: query.sortOrder }]
            : [{ deadline: query.sortOrder }, { createdAt: 'desc' }],
      ...toSkipTake(query.page, query.limit),
    });
    const total = await prisma.homework.count({ where });
    return { items: items.map(toDto), total };
  },

  async getById(actor: AuthUser, id: string): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    return toDetailDto(await findVisible(access, id));
  },

  async create(actor: AuthUser, input: CreateHomeworkInput, client: ClientInfo): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    const group = await assertGroupVisible(access, input.groupId);
    await assertLinks(group.courseId, input);
    const targetType = input.targetType ?? 'GROUP';
    const targets = targetType === 'GROUP' ? undefined : (input.studentIds ?? []);
    if (targets) await assertTargets(group.id, targets);

    const id = await prisma.$transaction(async (tx) => {
      const homework = await tx.homework.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          groupId: group.id,
          courseId: group.courseId,
          teacherId: group.teacherId ?? actor.id,
          deadline: input.deadline,
          maxPoints: input.maxPoints,
          xpReward: input.xpReward,
          status: input.status,
          targetType,
          topicId: input.topicId ?? null,
          lessonId: input.lessonId ?? null,
          difficulty: input.difficulty ?? null,
          rubricId: input.rubricId ?? null,
        },
        select: { id: true },
      });

      // Qoralamada ham nishon saqlanishi uchun tanlangan o'quvchilar yozuvi darhol ochiladi
      const students = input.status === 'PUBLISHED' || targets ? await ensureSubmissions(tx, homework.id, group.id, targets) : 0;
      // O'quvchi va ota-onaga xabar — shu tranzaksiyada, e'lon bekor bo'lsa xabar ham ketmaydi
      if (input.status === 'PUBLISHED') await notifyHomeworkCreated(tx, homework.id);

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.created',
        entityType: 'homework',
        entityId: homework.id,
        metadata: { title: input.title, group: group.name, deadline: input.deadline.toISOString(), students, targetType },
        ...client,
      });
      return homework.id;
    });

    return this.getById(actor, id);
  },

  async update(actor: AuthUser, id: string, input: UpdateHomeworkInput, client: ClientInfo): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    await assertLinks(homework.group.courseId, {
      topicId: input.topicId,
      lessonId: input.lessonId,
      rubricId: input.rubricId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.homework.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
          ...(input.maxPoints === undefined ? {} : { maxPoints: input.maxPoints }),
          ...(input.xpReward === undefined ? {} : { xpReward: input.xpReward }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.topicId === undefined ? {} : { topicId: input.topicId }),
          ...(input.lessonId === undefined ? {} : { lessonId: input.lessonId }),
          ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
          ...(input.rubricId === undefined ? {} : { rubricId: input.rubricId }),
        },
      });

      // Qoralamadan e'lon qilinganda: butun guruhga — ro'yxat ochiladi; xabar ketadi
      if (input.status === 'PUBLISHED' && homework.status === 'DRAFT') {
        if (homework.targetType === 'GROUP') await ensureSubmissions(tx, id, homework.group.id);
        await notifyHomeworkCreated(tx, id);
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.updated',
        entityType: 'homework',
        entityId: id,
        metadata: { title: input.title ?? homework.title, status: input.status ?? homework.status },
        ...client,
      });
    });

    return this.getById(actor, id);
  },

  /** Baholangan vazifa o‘chirilmaydi — XP allaqachon berilgan */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    if (homework.submissions.some((row) => row.status === 'GRADED')) {
      throw AppError.conflict('Baholangan uy vazifasini o‘chirib bo‘lmaydi — uni yoping (CLOSED)');
    }
    const files = await prisma.homeworkAttachment.findMany({ where: { homeworkId: id, storagePath: { not: null } }, select: { storagePath: true } });

    await prisma.$transaction(async (tx) => {
      await tx.homework.delete({ where: { id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.deleted',
        entityType: 'homework',
        entityId: id,
        metadata: { title: homework.title, group: homework.group.name },
        ...client,
      });
    });
    await Promise.all(files.map((file) => removeStoredFile(file.storagePath!).catch(() => undefined)));
  },

  /** O'qituvchi bitta topshiriqni ochadi — javob, havola, kod, fayllar, rubrika (TZ §19) */
  async submissionDetail(actor: AuthUser, id: string, studentId: string): Promise<SubmissionDetailDto> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    const row = homework.submissions.find((item) => item.student.id === studentId);
    if (!row) throw AppError.notFound('Topshiriq topilmadi');
    const full = await prisma.homeworkSubmission.findUniqueOrThrow({
      where: { homeworkId_studentId: { homeworkId: id, studentId } },
      select: {
        codeLanguage: true,
        rubricScores: true,
        returnedAt: true,
        attachments: { orderBy: { createdAt: 'asc' }, select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } },
      },
    });
    return {
      ...toSubmissionDto(row),
      homeworkId: id,
      late: row.status === 'LATE' || Boolean(row.submittedAt && row.submittedAt.getTime() > new Date(homework.deadline).getTime()),
      answerText: row.answerText,
      linkUrl: row.linkUrl,
      codeText: row.codeText,
      codeLanguage: full.codeLanguage,
      rubricScores: (full.rubricScores as Record<string, number> | null) ?? null,
      returnedAt: full.returnedAt?.toISOString() ?? null,
      files: full.attachments.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
    };
  },

  /** O'quvchi faylini o'qituvchi oladi — faqat o'z guruhidagi vazifa */
  async submissionFile(actor: AuthUser, id: string, studentId: string, fileId: string): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const access = await getTeachingAccess(actor);
    await findVisible(access, id);
    return this.studentFile(studentId, id, fileId);
  },

  /**
   * Qayta ishlashga qaytarish (TZ §19: Return / Request resubmission): holat RETURNED,
   * izoh majburiy, o'quvchi va ota-onaga xabar. Ball qo'yilmaydi.
   */
  async returnSubmission(actor: AuthUser, id: string, studentId: string, input: ReturnSubmissionInput, client: ClientInfo): Promise<SubmissionDetailDto> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    const row = homework.submissions.find((item) => item.student.id === studentId);
    if (!row) throw AppError.notFound('Topshiriq topilmadi');
    if (!['SUBMITTED', 'LATE', 'GRADED'].includes(row.status)) {
      throw AppError.unprocessable('Faqat topshirilgan ishni qaytarish mumkin');
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.homeworkSubmission.update({
        where: { homeworkId_studentId: { homeworkId: id, studentId } },
        data: { status: 'RETURNED', feedback: input.feedback, returnedAt: now, score: null, rubricScores: undefined, gradedAt: null, gradedById: actor.id },
      });
      await notifyHomeworkReturned(tx, { homeworkId: id, studentId, feedback: input.feedback });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.returned',
        entityType: 'homework',
        entityId: id,
        metadata: { studentId, title: homework.title },
        ...client,
      });
    });
    return this.submissionDetail(actor, id, studentId);
  },

  /** Bitta o‘quvchining topshirig‘i: holat, ball (yoki rubrika), izoh va XP */
  async grade(
    actor: AuthUser,
    id: string,
    studentId: string,
    input: GradeSubmissionInput,
    client: ClientInfo,
  ): Promise<HomeworkDetailDto> {
    return this.bulkGrade(actor, id, { records: [{ studentId, ...input }] }, client);
  },

  /**
   * Butun guruhni bir marta baholaydi. Topshirgan o‘quvchiga XP beriladi
   * (kechikkaniga berilmaydi), ball qo‘yilsa holat avtomatik GRADED bo‘ladi.
   * Rubrika bo'lsa va `rubricScores` yuborilsa — ball serverda hisoblanadi.
   */
  async bulkGrade(actor: AuthUser, id: string, input: BulkGradeInput, client: ClientInfo): Promise<HomeworkDetailDto> {
    const access = await getTeachingAccess(actor);
    const homework = await findVisible(access, id);
    if (homework.status === 'DRAFT') {
      throw AppError.unprocessable('Avval uy vazifasini e’lon qiling');
    }
    const criteria = homework.rubric ? parseCriteria(homework.rubric.criteria) : null;

    const known = new Map(homework.submissions.map((row) => [row.student.id, row]));
    const records = input.records.map((record) => {
      if (!known.has(record.studentId)) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'studentId', message: 'O‘quvchi bu vazifaga biriktirilmagan' },
        ]);
      }
      if (record.rubricScores && !criteria) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'rubricScores', message: 'Bu vazifaga rubrika biriktirilmagan' }]);
      }
      const score = record.rubricScores && criteria ? scoreFromRubric(criteria, record.rubricScores, homework.maxPoints) : record.score;
      if (score !== undefined && score > homework.maxPoints) {
        throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [
          { field: 'score', message: `Ball ${homework.maxPoints} dan oshmasligi kerak` },
        ]);
      }
      return { ...record, score };
    });

    const deadlinePassed = homework.deadline.getTime() < Date.now();
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const current = known.get(record.studentId);
        if (!current) continue;
        const status = resolveStatus(current.status, record, deadlinePassed);
        const submittedAt = SUBMITTED_STATUSES.includes(status) ? (current.submittedAt ?? now) : null;

        const submission = await tx.homeworkSubmission.update({
          where: { homeworkId_studentId: { homeworkId: id, studentId: record.studentId } },
          data: {
            status,
            submittedAt,
            ...(record.score === undefined ? {} : { score: record.score }),
            ...(record.feedback === undefined ? {} : { feedback: record.feedback }),
            ...(record.rubricScores === undefined ? {} : { rubricScores: record.rubricScores }),
            ...(record.score === undefined ? {} : { gradedById: actor.id, gradedAt: now }),
          },
          select: { id: true },
        });

        // XP faqat topshirgan o‘quvchiga; qayta baholansa dedupeKey takrorlamaydi
        if (SUBMITTED_STATUSES.includes(status)) {
          const points = await gamificationHooks.onHomeworkSubmitted(tx, {
            studentId: record.studentId,
            submissionId: submission.id,
            onTime: status !== 'LATE',
          });
          await tx.homeworkSubmission.update({ where: { id: submission.id }, data: { xpAwarded: points } });
        }
        if (record.score !== undefined) {
          await notifyHomeworkGraded(tx, { homeworkId: id, studentId: record.studentId, score: record.score, feedback: record.feedback ?? null });
        }
      }

      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'homework.graded',
        entityType: 'homework',
        entityId: id,
        metadata: { title: homework.title, group: homework.group.name, students: records.length, rubric: Boolean(criteria) },
        ...client,
      });
    });

    return this.getById(actor, id);
  },

  // -------------------------------------------------------------------
  // O'qituvchi biriktirmalari (TZ §15: Attachments)
  // -------------------------------------------------------------------

  async addLink(actor: AuthUser, id: string, input: HomeworkLinkInput, client: ClientInfo): Promise<AttachmentDto> {
    const access = await getTeachingAccess(actor);
    await findVisible(access, id);
    const created = await prisma.homeworkAttachment.create({
      data: { homeworkId: id, kind: 'LINK', title: input.title, url: input.url },
      select: attachmentSelect,
    });
    await auditService.record({ userId: actor.id, action: 'homework.attachment_added', entityType: 'homework', entityId: id, metadata: { kind: 'LINK' }, ...client });
    return created;
  },

  async uploadAttachment(actor: AuthUser, id: string, file: { buffer: unknown; fileName: string | undefined; title: string | undefined }, client: ClientInfo): Promise<AttachmentDto> {
    const access = await getTeachingAccess(actor);
    await findVisible(access, id);
    const stored = await storeUpload(file);
    const created = await prisma.homeworkAttachment.create({
      data: {
        homeworkId: id,
        kind: 'FILE',
        title: (file.title?.trim() || stored.originalName).slice(0, 200),
        storagePath: stored.storagePath,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
      },
      select: attachmentSelect,
    });
    await auditService.record({ userId: actor.id, action: 'homework.attachment_added', entityType: 'homework', entityId: id, metadata: { kind: 'FILE', size: stored.size }, ...client });
    return created;
  },

  async removeAttachment(actor: AuthUser, attachmentId: string, client: ClientInfo): Promise<void> {
    const attachment = await prisma.homeworkAttachment.findUnique({ where: { id: attachmentId }, select: { homeworkId: true, storagePath: true, title: true } });
    if (!attachment) throw AppError.notFound('Fayl topilmadi');
    const access = await getTeachingAccess(actor);
    await findVisible(access, attachment.homeworkId);
    await prisma.homeworkAttachment.delete({ where: { id: attachmentId } });
    await auditService.record({ userId: actor.id, action: 'homework.attachment_removed', entityType: 'homework', entityId: attachment.homeworkId, metadata: { title: attachment.title }, ...client });
    if (attachment.storagePath) await removeStoredFile(attachment.storagePath).catch(() => undefined);
  },

  async attachmentFile(actor: AuthUser, attachmentId: string): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const attachment = await prisma.homeworkAttachment.findUnique({ where: { id: attachmentId }, select: { homeworkId: true, storagePath: true, originalName: true, mimeType: true } });
    if (!attachment?.storagePath) throw AppError.notFound('Fayl topilmadi');
    const access = await getTeachingAccess(actor);
    await findVisible(access, attachment.homeworkId);
    return { absolutePath: resolveStoredPath(attachment.storagePath), fileName: attachment.originalName ?? 'fayl', mimeType: attachment.mimeType ?? 'application/octet-stream' };
  },
};

/** Saqlangan yo'l kengaytmasidan MIME (faqat qabul qilinadigan turlar) */
function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'application/octet-stream';
}

/** Fayl siyosati hujjatlar bilan bir xil: tur baytlar bo'yicha (PDF/PNG/JPG/WEBP) */
async function storeUpload(file: { buffer: unknown; fileName: string | undefined }): Promise<{ storagePath: string; originalName: string; mimeType: string; size: number }> {
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw AppError.unprocessable('Fayl bo‘sh', [{ field: 'file', message: 'Faylni tanlang' }]);
  }
  const type = detectFileType(file.buffer);
  if (!type) {
    throw AppError.unprocessable('Faqat rasm (JPG, PNG, WEBP) yoki PDF qabul qilinadi. Kod yoki boshqa faylni havola sifatida yuboring', [
      { field: 'file', message: 'Fayl turi qo‘llanmaydi' },
    ]);
  }
  const storagePath = await saveFile(file.buffer, type.ext);
  return { storagePath, originalName: sanitizeFileName(file.fileName, type.ext), mimeType: type.mime, size: file.buffer.length };
}
