import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { addDays, businessDateString, businessDayFromString } from '../utils/dates.js';
import { branchFilter, getBranchAccess } from './branchAccess.js';
import { getMasterySettings } from './mastery.service.js';
import { getTeachingAccess } from './teachingAccess.js';

/**
 * Akademik analitika (TZ 3.0 §46–49). Kesimlar: kurs, guruh, o'qituvchi, mavzu, vazifa, imtihon,
 * o'quvchi. Metrikalar: davomat, vazifa topshirish, o'rtacha ball, imtihon, mavzu o'zlashtirishi,
 * progress (dastur bajarilishi), retention, risk.
 *
 * Tamoyillar:
 *  - **Yig'ma (pooled) foizlar**: guruh davomati — o'quvchilar foizlarining o'rtachasi emas, jami
 *    qatnashish / jami belgilar (kichik guruhlar natijani buzmaydi).
 *  - **Faqat tavsif** (§48–49): tartib — ko'rsatkich bo'yicha saralash, "yaxshi/yomon o'qituvchi"
 *    xulosasi yo'q. Kuzatuvlar faqat raqamli o'zgarish: "Frontend-12: vazifa 80% → 65%".
 *  - Doira: o'qituvchi faqat o'z guruhlari (`teachingAccess`), filial — `branchAccess`.
 */

export const ACADEMIC_DIMENSIONS = ['course', 'group', 'teacher', 'topic', 'homework', 'exam', 'student'] as const;
export type AcademicDimension = (typeof ACADEMIC_DIMENSIONS)[number];

export interface AcademicRowDto {
  key: string;
  label: string;
  sublabel: string | null;
  students: number | null;
  attendanceRate: number | null;
  homeworkRate: number | null;
  averageScore: number | null;
  examAverage: number | null;
  passRate: number | null;
  mastery: number | null;
  progress: number | null;
  retention: number | null;
  atRisk: number | null;
  /** O'qituvchi/guruh: o'quvchi fikrlari o'rtacha bahosi (1–5) */
  feedback: number | null;
  /** Kurs: eng zaif mavzular */
  weakTopics?: Array<{ id: string; title: string; mastery: number }>;
  /** Vazifa kesimi: kech topshirilgan va topshirilmagan ulushi (%) */
  lateRate?: number | null;
  missedRate?: number | null;
  /** Mavzu kesimi: o'zlashtirgan (MASTERED) o'quvchilar ulushi (%) */
  masteredShare?: number | null;
}

export interface AcademicAnalyticsDto {
  dimension: AcademicDimension;
  from: string;
  to: string;
  rows: AcademicRowDto[];
  totals: Omit<AcademicRowDto, 'key' | 'label' | 'sublabel' | 'weakTopics' | 'lateRate' | 'missedRate' | 'masteredShare'>;
  /** Faqat raqamli kuzatuvlar (oldingi teng davr bilan solishtirish) */
  observations: string[];
}

export interface AcademicQuery {
  dimension: AcademicDimension;
  from?: string | undefined;
  to?: string | undefined;
  courseId?: string | undefined;
  groupId?: string | undefined;
}

interface Raw {
  attended: number;
  marks: number;
  hwDone: number;
  hwTotal: number;
  scoreSum: number;
  scoreCount: number;
  examSum: number;
  examCount: number;
  examPassed: number;
}

const emptyRaw = (): Raw => ({ attended: 0, marks: 0, hwDone: 0, hwTotal: 0, scoreSum: 0, scoreCount: 0, examSum: 0, examCount: 0, examPassed: 0 });
const pct = (part: number, total: number) => (total === 0 ? null : Math.round((part / total) * 100));
const avgOf = (values: Array<number | null | undefined>) => {
  const list = values.filter((value): value is number => typeof value === 'number');
  return list.length === 0 ? null : Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
};

function resolveRange(query: { from?: string | undefined; to?: string | undefined }, now = new Date()) {
  const to = query.to ?? businessDateString(now);
  const from = query.from ?? businessDateString(addDays(businessDayFromString(to), -29));
  if (from > to) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'from', message: 'Boshlanish sanasi tugashdan keyin bo‘lmasin' }]);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'from', message: 'Davr bir yildan oshmasin' }]);
  return { from, to, days };
}

/** Sana oralig'i: `@db.Date` ustunlar va vaqt belgilari uchun */
function bounds(from: string, to: string) {
  const startDay = new Date(`${from}T00:00:00Z`);
  const endDay = new Date(`${to}T00:00:00Z`);
  return {
    dateGte: startDay,
    dateLte: endDay,
    momentGte: businessDayFromString(from),
    momentLt: addDays(businessDayFromString(to), 1),
  };
}

type ScopedStudent = { id: string; firstName: string; lastName: string; groupId: string | null; courseId: string; status: string; riskLevel: string | null; group: { name: string; teacherId: string | null; teacher: { firstName: string; lastName: string } | null } | null; course: { name: string } };

async function scopeWhere(actor: AuthUser, query: AcademicQuery): Promise<Prisma.GroupWhereInput> {
  const [teaching, branch] = await Promise.all([getTeachingAccess(actor), getBranchAccess(actor)]);
  return {
    ...branchFilter(branch),
    ...(teaching.onlyOwnGroups ? { teacherId: teaching.userId } : {}),
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.groupId ? { id: query.groupId } : {}),
  };
}

/** O'quvchilar bo'yicha xom ko'rsatkichlar — bitta davr uchun (bir necha `groupBy` so'rovida) */
async function rawByStudent(studentIds: string[], from: string, to: string): Promise<Map<string, Raw>> {
  const map = new Map<string, Raw>(studentIds.map((id) => [id, emptyRaw()]));
  if (studentIds.length === 0) return map;
  const range = bounds(from, to);
  const [attendance, homework, graded, exams] = await Promise.all([
    prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { studentId: { in: studentIds }, status: { not: 'EXCUSED' }, date: { gte: range.dateGte, lte: range.dateLte } }, _count: { _all: true } }),
    prisma.homeworkSubmission.groupBy({
      by: ['studentId', 'status'],
      where: { studentId: { in: studentIds }, homework: { status: { not: 'DRAFT' }, deadline: { gte: range.momentGte, lt: range.momentLt } } },
      _count: { _all: true },
    }),
    prisma.homeworkSubmission.findMany({
      where: { studentId: { in: studentIds }, score: { not: null }, homework: { status: { not: 'DRAFT' }, deadline: { gte: range.momentGte, lt: range.momentLt } } },
      select: { studentId: true, score: true, homework: { select: { maxPoints: true } } },
    }),
    prisma.examResult.findMany({
      where: { studentId: { in: studentIds }, exam: { status: { not: 'CANCELLED' }, date: { gte: range.dateGte, lte: range.dateLte } } },
      select: { studentId: true, score: true, percentage: true, exam: { select: { passScore: true } } },
    }),
  ]);
  for (const row of attendance) {
    const raw = map.get(row.studentId)!;
    raw.marks += row._count._all;
    if (row.status === 'PRESENT' || row.status === 'LATE') raw.attended += row._count._all;
  }
  for (const row of homework) {
    const raw = map.get(row.studentId)!;
    raw.hwTotal += row._count._all;
    if (row.status === 'SUBMITTED' || row.status === 'LATE' || row.status === 'GRADED') raw.hwDone += row._count._all;
  }
  for (const row of graded) {
    const raw = map.get(row.studentId)!;
    raw.scoreSum += Math.min(100, ((row.score ?? 0) / Math.max(1, row.homework.maxPoints)) * 100);
    raw.scoreCount += 1;
  }
  for (const row of exams) {
    const raw = map.get(row.studentId)!;
    raw.examSum += row.percentage;
    raw.examCount += 1;
    if (row.exam.passScore === null ? row.percentage >= 60 : row.score >= row.exam.passScore) raw.examPassed += 1;
  }
  return map;
}

function combine(raws: Raw[]): Raw {
  return raws.reduce((acc, raw) => {
    for (const key of Object.keys(acc) as Array<keyof Raw>) acc[key] += raw[key];
    return acc;
  }, emptyRaw());
}

function metricsOf(raw: Raw) {
  return {
    attendanceRate: pct(raw.attended, raw.marks),
    homeworkRate: pct(raw.hwDone, raw.hwTotal),
    averageScore: raw.scoreCount ? Math.round(raw.scoreSum / raw.scoreCount) : null,
    examAverage: raw.examCount ? Math.round(raw.examSum / raw.examCount) : null,
    passRate: pct(raw.examPassed, raw.examCount),
  };
}

export const academicAnalyticsService = {
  async build(actor: AuthUser, query: AcademicQuery, now: Date = new Date()): Promise<AcademicAnalyticsDto> {
    const { from, to, days } = resolveRange(query, now);
    const groupWhere = await scopeWhere(actor, query);
    const range = bounds(from, to);

    const students = (await prisma.student.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] }, group: groupWhere },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        groupId: true,
        courseId: true,
        status: true,
        riskLevel: true,
        group: { select: { name: true, teacherId: true, teacher: { select: { firstName: true, lastName: true } } } },
        course: { select: { name: true } },
      },
    })) as ScopedStudent[];
    const ids = students.map((student) => student.id);

    // Davrda o'qishni tashlaganlar (retention) — kurs/guruh bo'yicha hozirgi bog'lanish bilan
    const dropped = await prisma.studentStatusChange.findMany({
      where: { toStatus: 'DROPPED', changedAt: { gte: range.momentGte, lt: range.momentLt }, student: { group: groupWhere } },
      select: { student: { select: { id: true, groupId: true, courseId: true, group: { select: { teacherId: true } } } } },
      distinct: ['studentId'],
    });

    const previousTo = businessDateString(addDays(businessDayFromString(from), -1));
    const previousFrom = businessDateString(addDays(businessDayFromString(from), -days));
    const [current, previous, masteryRows, completedRows, topicCounts, feedbackRows] = await Promise.all([
      rawByStudent(ids, from, to),
      query.dimension === 'group' || query.dimension === 'teacher' ? rawByStudent(ids, previousFrom, previousTo) : Promise.resolve(new Map<string, Raw>()),
      ids.length ? prisma.topicMastery.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, score: { not: null } }, _avg: { score: true } }) : Promise.resolve([]),
      ids.length ? prisma.studentTopicProgress.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, status: 'COMPLETED' }, _count: { _all: true } }) : Promise.resolve([]),
      prisma.courseTopic.groupBy({ by: ['moduleId'], where: { isActive: true, module: { isActive: true } }, _count: { _all: true } }),
      prisma.feedback.findMany({ where: { rating: { not: null }, createdAt: { gte: range.momentGte, lt: range.momentLt } }, select: { teacherId: true, groupId: true, rating: true } }),
    ]);
    const modules = await prisma.courseModule.findMany({ where: { id: { in: topicCounts.map((row) => row.moduleId) } }, select: { id: true, courseId: true } });
    const topicsPerCourse = new Map<string, number>();
    for (const row of topicCounts) {
      const courseId = modules.find((module) => module.id === row.moduleId)?.courseId;
      if (courseId) topicsPerCourse.set(courseId, (topicsPerCourse.get(courseId) ?? 0) + row._count._all);
    }
    const masteryBy = new Map(masteryRows.map((row) => [row.studentId, row._avg.score]));
    const completedBy = new Map(completedRows.map((row) => [row.studentId, row._count._all]));
    const progressOf = (student: ScopedStudent) => {
      const total = topicsPerCourse.get(student.courseId) ?? 0;
      return total === 0 ? null : Math.min(100, Math.round(((completedBy.get(student.id) ?? 0) / total) * 100));
    };

    /** O'quvchilar to'plami bo'yicha qator */
    const summarize = (members: ScopedStudent[], droppedCount: number, feedback: number[]): Omit<AcademicRowDto, 'key' | 'label' | 'sublabel'> => {
      const raw = combine(members.map((member) => current.get(member.id)!));
      return {
        students: members.length,
        ...metricsOf(raw),
        mastery: avgOf(members.map((member) => masteryBy.get(member.id))),
        progress: avgOf(members.map(progressOf)),
        retention: members.length + droppedCount === 0 ? null : Math.round((members.length / (members.length + droppedCount)) * 100),
        atRisk: members.filter((member) => member.riskLevel === 'AT_RISK' || member.riskLevel === 'CRITICAL').length,
        feedback: feedback.length ? Math.round((feedback.reduce((sum, value) => sum + value, 0) / feedback.length) * 10) / 10 : null,
      };
    };

    const groupBy = <K extends string>(keyOf: (student: ScopedStudent) => K | null) => {
      const map = new Map<K, ScopedStudent[]>();
      for (const student of students) {
        const key = keyOf(student);
        if (key === null) continue;
        map.set(key, [...(map.get(key) ?? []), student]);
      }
      return map;
    };

    let rows: AcademicRowDto[];
    const observations: string[] = [];
    const settings = await getMasterySettings();

    if (query.dimension === 'course') {
      const byCourse = groupBy((student) => student.courseId);
      const weakRows = ids.length
        ? await prisma.topicMastery.groupBy({ by: ['topicId'], where: { studentId: { in: ids }, score: { not: null } }, _avg: { score: true } })
        : [];
      const weakTopics = await prisma.courseTopic.findMany({ where: { id: { in: weakRows.map((row) => row.topicId) } }, select: { id: true, title: true, module: { select: { courseId: true } } } });
      rows = [...byCourse].map(([courseId, members]) => ({
        key: courseId,
        label: members[0]!.course.name,
        sublabel: `${new Set(members.map((member) => member.groupId)).size} guruh`,
        ...summarize(members, dropped.filter((row) => row.student.courseId === courseId).length, []),
        weakTopics: weakRows
          .map((row) => ({ row, topic: weakTopics.find((topic) => topic.id === row.topicId) }))
          .filter((item) => item.topic?.module.courseId === courseId && (item.row._avg.score ?? 100) < settings.thresholds.good)
          .sort((a, b) => (a.row._avg.score ?? 0) - (b.row._avg.score ?? 0))
          .slice(0, 3)
          .map((item) => ({ id: item.topic!.id, title: item.topic!.title, mastery: Math.round(item.row._avg.score ?? 0) })),
      }));
    } else if (query.dimension === 'group' || query.dimension === 'teacher') {
      const isGroup = query.dimension === 'group';
      const byKey = groupBy((student) => (isGroup ? student.groupId : (student.group?.teacherId ?? null)));
      rows = [...byKey].map(([key, members]) => {
        const first = members[0]!;
        const label = isGroup ? (first.group?.name ?? '—') : first.group?.teacher ? `${first.group.teacher.firstName} ${first.group.teacher.lastName}` : '—';
        const droppedCount = dropped.filter((row) => (isGroup ? row.student.groupId === key : row.student.group?.teacherId === key)).length;
        const feedback = feedbackRows.filter((row) => (isGroup ? row.groupId === key : row.teacherId === key)).map((row) => row.rating!);
        const row: AcademicRowDto = {
          key,
          label,
          sublabel: isGroup ? first.course.name : `${new Set(members.map((member) => member.groupId)).size} guruh`,
          ...summarize(members, droppedCount, feedback),
        };
        // Faqat raqamli kuzatuv: oldingi teng davr bilan (§49 — hukm emas)
        const before = metricsOf(combine(members.map((member) => previous.get(member.id) ?? emptyRaw())));
        const changes: Array<[string, number | null, number | null]> = [
          ['davomat', before.attendanceRate, row.attendanceRate],
          ['vazifa topshirish', before.homeworkRate, row.homeworkRate],
          ['imtihon o‘rtachasi', before.examAverage, row.examAverage],
        ];
        for (const [name, was, now] of changes) {
          if (was !== null && now !== null && Math.abs(now - was) >= 10) observations.push(`${label}: ${name} ${was}% → ${now}% (${now > was ? 'oshdi' : 'pasaydi'}).`);
        }
        return row;
      });
    } else if (query.dimension === 'student') {
      rows = students.map((student) => ({
        key: student.id,
        label: `${student.lastName} ${student.firstName}`,
        sublabel: student.group?.name ?? null,
        ...summarize([student], 0, []),
        retention: null,
        students: null,
      }));
    } else if (query.dimension === 'topic') {
      const topicRows = ids.length
        ? await prisma.topicMastery.groupBy({ by: ['topicId'], where: { studentId: { in: ids }, score: { not: null } }, _avg: { score: true }, _count: { _all: true } })
        : [];
      const mastered = ids.length ? await prisma.topicMastery.groupBy({ by: ['topicId'], where: { studentId: { in: ids }, status: 'MASTERED' }, _count: { _all: true } }) : [];
      const topics = await prisma.courseTopic.findMany({ where: { id: { in: topicRows.map((row) => row.topicId) } }, select: { id: true, title: true, module: { select: { title: true, course: { select: { name: true } } } } } });
      rows = topicRows.map((row) => {
        const topic = topics.find((item) => item.id === row.topicId);
        return {
          key: row.topicId,
          label: topic?.title ?? '—',
          sublabel: topic ? `${topic.module.course.name} · ${topic.module.title}` : null,
          students: row._count._all,
          attendanceRate: null,
          homeworkRate: null,
          averageScore: null,
          examAverage: null,
          passRate: null,
          masteredShare: pct(mastered.find((item) => item.topicId === row.topicId)?._count._all ?? 0, row._count._all),
          mastery: Math.round(row._avg.score ?? 0),
          progress: null,
          retention: null,
          atRisk: null,
          feedback: null,
        };
      });
    } else if (query.dimension === 'homework') {
      const list = await prisma.homework.findMany({
        where: { status: { not: 'DRAFT' }, deadline: { gte: range.momentGte, lt: range.momentLt }, group: groupWhere },
        select: { id: true, title: true, maxPoints: true, group: { select: { name: true } }, submissions: { select: { status: true, score: true } } },
        take: 200,
      });
      rows = list.map((homework) => {
        const done = homework.submissions.filter((row) => ['SUBMITTED', 'LATE', 'GRADED'].includes(row.status)).length;
        const graded = homework.submissions.filter((row) => row.score !== null);
        return {
          key: homework.id,
          label: homework.title,
          sublabel: homework.group.name,
          students: homework.submissions.length,
          attendanceRate: null,
          homeworkRate: pct(done, homework.submissions.length),
          averageScore: graded.length ? Math.round(graded.reduce((sum, row) => sum + ((row.score ?? 0) / Math.max(1, homework.maxPoints)) * 100, 0) / graded.length) : null,
          examAverage: null,
          passRate: null,
          lateRate: pct(homework.submissions.filter((row) => row.status === 'LATE').length, homework.submissions.length),
          missedRate: pct(homework.submissions.filter((row) => row.status === 'MISSED').length, homework.submissions.length),
          mastery: null,
          progress: null,
          retention: null,
          atRisk: null,
          feedback: null,
        };
      });
    } else {
      const list = await prisma.exam.findMany({
        where: { status: { not: 'CANCELLED' }, date: { gte: range.dateGte, lte: range.dateLte }, group: groupWhere },
        select: { id: true, title: true, passScore: true, group: { select: { name: true } }, results: { select: { score: true, percentage: true } } },
        take: 200,
      });
      rows = list.map((exam) => ({
        key: exam.id,
        label: exam.title,
        sublabel: exam.group.name,
        students: exam.results.length,
        attendanceRate: null,
        homeworkRate: null,
        averageScore: null,
        examAverage: exam.results.length ? Math.round(exam.results.reduce((sum, row) => sum + row.percentage, 0) / exam.results.length) : null,
        passRate: pct(exam.results.filter((row) => (exam.passScore === null ? row.percentage >= 60 : row.score >= exam.passScore)).length, exam.results.length),
        mastery: null,
        progress: null,
        retention: null,
        atRisk: null,
        feedback: null,
      }));
    }

    const allFeedback = feedbackRows.map((row) => row.rating!);
    return {
      dimension: query.dimension,
      from,
      to,
      rows,
      totals: summarize(students, dropped.length, allFeedback),
      observations,
    };
  },
};
