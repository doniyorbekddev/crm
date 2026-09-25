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
import { buildStudentExamRows, buildStudentHomeworkRows } from './studentProgress.service.js';
import { buildAttendanceCalendar } from './attendanceAnalytics.service.js';
import { gamificationService } from './gamification.service.js';
import { homeworkService } from './homework.service.js';
import { detectFileType, saveFile } from '../utils/fileStorage.js';
import { currentBusinessMonth } from '../utils/dates.js';
import { ownerForActor, telegramLinkService } from './telegramLink.service.js';
import { examAttemptService } from './examAttempt.service.js';
import type { AttemptDto } from './examAttempt.service.js';
import type { StudentExamRowDto } from './studentProgress.service.js';
import { resolveStoredPath } from '../utils/fileStorage.js';
import { resolveWeekStart, weeklyReportService } from './weeklyReport.service.js';
import { lessonService } from './lesson.service.js';
import type { LessonDto, LessonTreeDto } from './lesson.service.js';
import type { WeeklyReportDto } from './weeklyReport.service.js';
import type { ExamStatus, HomeworkStatus, RiskLevel, SubmissionStatus } from '../generated/prisma/client.js';

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
  /** Kabinet sarlavhasidagi qo'ng'iroqcha uchun — alohida so'rov kerak bo'lmasin */
  unreadNotifications: number;
  /** Telegram bog'langan va tasdiqlanganmi (sozlamalar bo'limi uchun) */
  telegramLinked: boolean;
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

/**
 * Bosh sahifa uchun qo'shimcha ko'rsatkichlar — profil (`/profile`) bilan birga ishlatiladi.
 * Risk **yumshoq** ko'rinishda: daraja va sabablar, ball emas (o'quvchini qo'rqitmaslik uchun).
 */
export interface PortalOverviewDto {
  /** Kurs dasturi bo'yicha progress, 0–100; dastur yo'q bo'lsa null */
  courseProgress: number | null;
  risk: { level: RiskLevel; reasons: string[] } | null;
  nextLesson: PortalLessonDto | null;
  pendingHomework: { count: number; next: { homeworkId: string; title: string; deadline: string } | null };
  nextExam: { examId: string; title: string; date: string } | null;
}

export interface PortalHomeworkDetailDto {
  homework: {
    id: string;
    title: string;
    description: string | null;
    status: HomeworkStatus;
    assignedAt: string;
    deadline: string;
    maxPoints: number;
    xpReward: number;
    groupName: string;
    courseName: string | null;
    teacherName: string | null;
  };
  submission: {
    status: SubmissionStatus;
    submittedAt: string | null;
    score: number | null;
    feedback: string | null;
    answerText: string | null;
    hasAttachment: boolean;
    xpAwarded: number;
    gradedAt: string | null;
  };
  /** Topshirish (yoki qayta topshirish) mumkinmi — baholanmagan va vazifa ochiq */
  canSubmit: boolean;
  /** Muddat o'tgan — topshirsa LATE bo'ladi */
  isLate: boolean;
}

export interface PortalExamDetailDto {
  exam: {
    id: string;
    title: string;
    description: string | null;
    date: string;
    maxScore: number;
    passScore: number | null;
    status: ExamStatus;
    groupName: string;
  };
  result: StudentExamRowDto | null;
  /** O'quvchining o'z urinishlari (javoblari bilan) — mavzu kesimi shu yerdan */
  attempts: AttemptDto[];
}

/** Ota-ona bosh sahifasidagi farzand kartasi (o'quvchi uchun ham bitta karta) */
export interface PortalChildSummaryDto {
  studentId: string;
  code: string;
  fullName: string;
  groupName: string | null;
  courseName: string;
  attendanceRate: number;
  homeworkRate: number;
  examAverage: number | null;
  totalXp: number;
  level: number;
  debt: { remaining: number; overdue: number };
  risk: RiskLevel | null;
  nextLesson: PortalLessonDto | null;
}

/** Saqlangan fayl kengaytmasi → MIME (faqat `detectFileType` qabul qiladigan turlar) */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** `riskFactors` JSON dan sabablar: past balli omillar birinchi */
function riskReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { label: string; value: string; score: number } =>
      typeof item === 'object' && item !== null && typeof (item as { score?: unknown }).score === 'number' && (item as { score: number }).score < 60,
    )
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => `${item.label}: ${item.value}`);
}

/** Guruh jadvalidan keyingi 14 kundagi darslar (bosh sahifa va dashboard uchun umumiy) */
async function buildUpcomingLessons(studentId: string): Promise<PortalLessonsDto> {
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
}

export const portalService = {
  async me(actor: AuthUser): Promise<PortalMeDto> {
    const scope = await resolvePortalScope(actor);
    const [rows, unreadNotifications, telegramLink] = await Promise.all([
      prisma.student.findMany({
        where: { id: { in: scope.studentIds }, deletedAt: null },
        select: studentSelect,
        orderBy: { firstName: 'asc' },
      }),
      prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
      telegramLinkService.status(await ownerForActor(actor.id)),
    ]);
    return {
      kind: scope.kind,
      fullName: scope.fullName,
      children: rows.map(toChild),
      unreadNotifications,
      telegramLinked: Boolean(telegramLink && telegramLink.verifiedAt !== null && telegramLink.isActive),
    };
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
    return buildUpcomingLessons(studentId);
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

  /** Uy vazifalari ro'yxati (topshiriq holati, ball, izoh bilan) */
  async homework(actor: AuthUser, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return buildStudentHomeworkRows(studentId);
  },

  async exams(actor: AuthUser, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return buildStudentExamRows(studentId);
  },

  /** Oylik davomat kalendari; oy berilmasa — joriy oy (o'quv markaz vaqti bo'yicha) */
  async attendanceCalendar(actor: AuthUser, query: { year?: number | undefined; month?: number | undefined }, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const student = await prisma.student.findFirstOrThrow({
      where: { id: studentId, deletedAt: null },
      select: { id: true, number: true, firstName: true, lastName: true },
    });
    const current = currentBusinessMonth();
    return buildAttendanceCalendar(student, query.year ?? current.year, query.month ?? current.month);
  },

  /** XP, daraja, seriya, reyting, nishonlar */
  async gamification(actor: AuthUser, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return gamificationService.profile(studentId);
  },

  /** To'lov jadvali + so'nggi to'lovlar tarixi */
  async payments(actor: AuthUser, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const [schedule, rows] = await Promise.all([
      paymentScheduleService.get(studentId),
      prisma.payment.findMany({
        where: { studentId, deletedAt: null },
        orderBy: { paidAt: 'desc' },
        take: 20,
        select: { id: true, amount: true, method: true, paidAt: true },
      }),
    ]);
    return {
      schedule,
      history: rows.map((row) => ({ id: row.id, amount: row.amount.toNumber(), method: row.method, paidAt: row.paidAt.toISOString() })),
    };
  },

  /** Matnli javob bilan topshirish. Egalik: `requireOwnStudent` + topshiriq yozuvi faqat guruh a'zosida */
  async submitHomework(actor: AuthUser, homeworkId: string, input: { answerText: string }, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return homeworkService.submitByStudent(studentId, homeworkId, { answerText: input.answerText, source: 'portal' });
  },

  /** Fayl bilan topshirish — hujjatlar bilan bir xil tekshiruv: tur baytlar bo'yicha aniqlanadi */
  async submitHomeworkAttachment(actor: AuthUser, homeworkId: string, file: { buffer: Buffer; fileName: string | undefined }, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw AppError.unprocessable('Fayl bo‘sh', [{ field: 'file', message: 'Faylni tanlang' }]);
    }
    const type = detectFileType(file.buffer);
    if (!type) {
      throw AppError.unprocessable('Faqat rasm (JPG, PNG, WEBP) yoki PDF qabul qilinadi', [{ field: 'file', message: 'Fayl turi qo‘llanmaydi' }]);
    }
    const attachmentPath = await saveFile(file.buffer, type.ext);
    return homeworkService.submitByStudent(studentId, homeworkId, { attachmentPath, source: 'portal' });
  },

  /** Bosh sahifa: kurs progressi, risk, keyingi dars, kutilayotgan vazifalar, keyingi imtihon */
  async overview(actor: AuthUser, requestedStudentId?: string): Promise<PortalOverviewDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const now = new Date();
    const today = startOfBusinessDay(now);
    const [student, curriculum, lessons, pendingCount, nextPending, nextExam] = await Promise.all([
      prisma.student.findFirstOrThrow({
        where: { id: studentId, deletedAt: null },
        select: { groupId: true, riskLevel: true, riskFactors: true },
      }),
      curriculumService.studentProgress(studentId),
      buildUpcomingLessons(studentId),
      prisma.homeworkSubmission.count({ where: { studentId, status: 'PENDING', homework: { status: 'PUBLISHED' } } }),
      prisma.homeworkSubmission.findFirst({
        where: { studentId, status: 'PENDING', homework: { status: 'PUBLISHED', deadline: { gte: now } } },
        orderBy: { homework: { deadline: 'asc' } },
        select: { homework: { select: { id: true, title: true, deadline: true } } },
      }),
      prisma.student
        .findFirst({ where: { id: studentId }, select: { groupId: true } })
        .then((row) =>
          row?.groupId
            ? prisma.exam.findFirst({
                where: { groupId: row.groupId, status: 'PLANNED', date: { gte: today } },
                orderBy: { date: 'asc' },
                select: { id: true, title: true, date: true },
              })
            : null,
        ),
    ]);

    return {
      courseProgress: curriculum ? curriculum.percent : null,
      risk: student.riskLevel ? { level: student.riskLevel, reasons: riskReasons(student.riskFactors) } : null,
      nextLesson: lessons.lessons.find((lesson) => lesson.status !== 'CANCELLED') ?? null,
      pendingHomework: {
        count: pendingCount,
        next: nextPending
          ? { homeworkId: nextPending.homework.id, title: nextPending.homework.title, deadline: nextPending.homework.deadline.toISOString() }
          : null,
      },
      nextExam: nextExam ? { examId: nextExam.id, title: nextExam.title, date: businessDateString(nextExam.date) } : null,
    };
  },

  /**
   * "Farzandlarim": har bir farzand bo'yicha qisqa ko'rsatkichlar (TZ §10).
   * Ota-onada odatda 1–3 farzand — har biri uchun mavjud profil quruvchisi chaqiriladi.
   */
  async children(actor: AuthUser): Promise<PortalChildSummaryDto[]> {
    const scope = await resolvePortalScope(actor);
    const records = await prisma.student.findMany({
      where: { id: { in: scope.studentIds }, deletedAt: null },
      select: studentDtoSelect,
      orderBy: { firstName: 'asc' },
    });
    return Promise.all(
      records.map(async (record) => {
        const dto = toStudentDto(record);
        const [profile, schedule, lessons, risk] = await Promise.all([
          buildStudentProfile(dto, { includePayments: false }),
          paymentScheduleService.get(record.id),
          buildUpcomingLessons(record.id),
          prisma.student.findUniqueOrThrow({ where: { id: record.id }, select: { riskLevel: true } }),
        ]);
        return {
          studentId: record.id,
          code: dto.code,
          fullName: `${dto.firstName} ${dto.lastName}`,
          groupName: dto.group?.name ?? null,
          courseName: dto.course.name,
          attendanceRate: profile.attendance.rate,
          homeworkRate: profile.homework.rate,
          examAverage: profile.exams.count ? profile.exams.averagePercent : null,
          totalXp: profile.gamification.totalXp,
          level: profile.gamification.level.number,
          debt: { remaining: Math.max(schedule.contractTotal - schedule.paid, 0), overdue: schedule.overdueAmount },
          risk: risk.riskLevel,
          nextLesson: lessons.lessons.find((lesson) => lesson.status !== 'CANCELLED') ?? null,
        };
      }),
    );
  },

  // ---------------------------------------------------------------
  // LMS (TZ §12–14): kurs dasturi, darslar, materiallar
  // ---------------------------------------------------------------

  /** O'z kursining nashr qilingan darslari (modul → mavzu → dars) va o'quvchi tugatganlari */
  async course(actor: AuthUser, requestedStudentId?: string): Promise<LessonTreeDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return lessonService.treeForStudent(studentId);
  },

  /** Bitta dars. O'quvchining o'zi ochsa — "ko'rildi" yoziladi; ota-ona ko'rsa — yo'q */
  async lesson(actor: AuthUser, lessonId: string, requestedStudentId?: string): Promise<LessonDto & { completed: boolean }> {
    const scope = await resolvePortalScope(actor);
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return lessonService.lessonForStudent(studentId, lessonId, scope.kind === 'STUDENT');
  },

  /** "Darsni o'rgandim" — faqat o'quvchining o'zi (ota-ona farzandi o'rniga belgilamaydi) */
  async setLessonCompleted(actor: AuthUser, lessonId: string, completed: boolean): Promise<{ completed: boolean }> {
    const scope = await resolvePortalScope(actor);
    if (scope.kind !== 'STUDENT') throw AppError.forbidden('Darsni faqat o‘quvchining o‘zi belgilaydi');
    return lessonService.setCompleted(scope.studentIds[0]!, lessonId, completed);
  },

  /** Dars materiali fayli — faqat o'z kursidagi nashr qilingan dars */
  async lessonMaterial(actor: AuthUser, materialId: string, requestedStudentId?: string) {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const student = await prisma.student.findFirstOrThrow({ where: { id: studentId, deletedAt: null }, select: { courseId: true } });
    return lessonService.materialFile(materialId, student.courseId);
  },

  /** Haftalik hisobot (TZ §11) — o'z farzandi/o'zi uchun */
  async weeklyReport(actor: AuthUser, week: string | undefined, requestedStudentId?: string): Promise<WeeklyReportDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    return weeklyReportService.build(studentId, resolveWeekStart(week));
  },

  /**
   * Bitta vazifa: tavsif, muddat, o'z topshirig'i va izoh.
   * Egalik: topshiriq yozuvi (`homeworkId` + `studentId`) — begona vazifa uchun yozuv yo'q → 404.
   */
  async homeworkDetail(actor: AuthUser, homeworkId: string, requestedStudentId?: string): Promise<PortalHomeworkDetailDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const row = await prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      select: {
        status: true,
        submittedAt: true,
        score: true,
        feedback: true,
        answerText: true,
        attachmentPath: true,
        xpAwarded: true,
        gradedAt: true,
        homework: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            assignedAt: true,
            deadline: true,
            maxPoints: true,
            xpReward: true,
            group: { select: { name: true } },
            course: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!row) throw AppError.notFound('Vazifa topilmadi');
    const { homework } = row;
    return {
      homework: {
        id: homework.id,
        title: homework.title,
        description: homework.description,
        status: homework.status,
        assignedAt: homework.assignedAt.toISOString(),
        deadline: homework.deadline.toISOString(),
        maxPoints: homework.maxPoints,
        xpReward: homework.xpReward,
        groupName: homework.group.name,
        courseName: homework.course?.name ?? null,
        teacherName: homework.teacher ? `${homework.teacher.firstName} ${homework.teacher.lastName}` : null,
      },
      submission: {
        status: row.status,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        score: row.score,
        feedback: row.feedback,
        answerText: row.answerText,
        hasAttachment: row.attachmentPath !== null,
        xpAwarded: row.xpAwarded,
        gradedAt: row.gradedAt?.toISOString() ?? null,
      },
      canSubmit: homework.status === 'PUBLISHED' && row.status !== 'GRADED',
      isLate: homework.deadline.getTime() < Date.now(),
    };
  },

  /** O'quvchining o'zi yuklagan faylni qaytarish — faqat o'z topshirig'i */
  async homeworkAttachment(
    actor: AuthUser,
    homeworkId: string,
    requestedStudentId?: string,
  ): Promise<{ absolutePath: string; fileName: string; mimeType: string }> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const row = await prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      select: { attachmentPath: true, homework: { select: { title: true } } },
    });
    if (!row?.attachmentPath) throw AppError.notFound('Fayl topilmadi');
    const ext = row.attachmentPath.split('.').pop()?.toLowerCase() ?? '';
    return {
      absolutePath: resolveStoredPath(row.attachmentPath),
      fileName: `${row.homework.title}.${ext}`,
      mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    };
  },

  /**
   * Bitta imtihon: natija va o'z urinishlari (mavzu kesimi bilan).
   * Egalik: imtihon o'quvchi guruhiniki yoki unda o'quvchining natijasi/urinishi bor.
   */
  async examDetail(actor: AuthUser, examId: string, requestedStudentId?: string): Promise<PortalExamDetailDto> {
    const studentId = await requireOwnStudent(actor, requestedStudentId);
    const student = await prisma.student.findFirstOrThrow({ where: { id: studentId, deletedAt: null }, select: { groupId: true } });
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        OR: [
          ...(student.groupId ? [{ groupId: student.groupId }] : []),
          { results: { some: { studentId } } },
          { attempts: { some: { studentId } } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        date: true,
        maxScore: true,
        passScore: true,
        status: true,
        group: { select: { name: true } },
      },
    });
    if (!exam) throw AppError.notFound('Imtihon topilmadi');

    const [rows, attempts] = await Promise.all([buildStudentExamRows(studentId), examAttemptService.listForStudent(examId, studentId)]);
    return {
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        date: businessDateString(exam.date),
        maxScore: exam.maxScore,
        passScore: exam.passScore,
        status: exam.status,
        groupName: exam.group.name,
      },
      result: rows.find((row) => row.examId === examId) ?? null,
      attempts,
    };
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
  /** Kirish uchun login: o'quvchida ID raqami (ST-000045), ota-onada email */
  login: string;
  /** Vaqtinchalik parol — xodim uni egasiga yetkazadi, keyin egasi o'zgartiradi */
  temporaryPassword: string;
}
