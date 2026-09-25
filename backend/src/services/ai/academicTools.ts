import { prisma } from '../../config/database.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { getMasterySettings } from '../mastery.service.js';
import { studentRiskService } from '../studentRisk.service.js';
import { teachingService } from '../teaching.service.js';
import { getTeachingAccess } from '../teachingAccess.js';
import type { AiTool, AiToolContext } from './tools.js';

/**
 * Akademik savollar uchun whitelist toollar (TZ 3.0 §37 o'qituvchi, §39 rahbar).
 * Har tool **o'qituvchi doirasida** ishlaydi: o'qituvchi faqat o'z guruhlari, admin/owner — hammasi
 * (`teachingService` va `teachingAccess` orqali). Javob faqat CRM raqamlaridan — til modeli ularni
 * o'zgartirmaydi. Ruxsat: `ai.academic`.
 */

const DAY = 86_400_000;

/** Doiradagi faol o'quvchilar va ularning riski — bitta ommaviy hisob (guruhlar soniga bog'liq emas) */
async function visibleStudents(context: AiToolContext) {
  const groupFilter = await scopedGroupFilter(context);
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] }, group: { ...groupFilter, status: 'ACTIVE' } },
    select: { id: true, firstName: true, lastName: true, group: { select: { name: true } } },
  });
  const risk = await studentRiskService.forStudents(
    students.map((student) => student.id),
    context.now,
  );
  return {
    rows: students.map((student) => {
      const entry = risk.get(student.id);
      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        groupName: student.group?.name ?? '—',
        riskLevel: entry?.riskLevel ?? null,
        healthScore: entry?.healthScore ?? null,
        reasons: entry?.reasons ?? [],
        factors: entry?.factors ?? [],
      };
    }),
  };
}

async function scopedGroupFilter(context: AiToolContext) {
  const access = await getTeachingAccess(context.actor);
  return access.onlyOwnGroups ? { teacherId: access.userId } : {};
}

export const ACADEMIC_TOOLS: readonly AiTool[] = [
  {
    key: 'students_need_help',
    title: 'Yordamga muhtoj o‘quvchilar',
    samples: ['Qaysi studentlar yordamga muhtoj?', 'Bugun kimga e’tibor berish kerak?'],
    keywords: ['yordamga muhtoj', 'yordam kerak', "e'tibor", 'kimga'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const { rows } = await visibleStudents(context);
      const needing = rows
        .filter((row) => row.riskLevel === 'AT_RISK' || row.riskLevel === 'CRITICAL' || (row.riskLevel === 'ATTENTION' && row.reasons.length > 0))
        .sort((a, b) => (a.healthScore ?? 101) - (b.healthScore ?? 101));
      if (needing.length === 0) return { answer: 'Hozir alohida e’tibor talab qiladigan o‘quvchi yo‘q.', link: '/teaching' };
      return {
        answer: `${needing.length} o‘quvchiga e’tibor kerak (eng xavflisidan boshlab).`,
        details: needing.slice(0, 7).map((row) => `${row.firstName} ${row.lastName} (${row.groupName}) — ${row.reasons.slice(0, 2).join('; ') || `sog‘lik ${row.healthScore}`}`),
        link: '/teaching',
      };
    },
  },
  {
    key: 'weak_topics',
    title: 'Zaif o‘zlashtirilgan mavzular',
    samples: ['Qaysi topic yomon o‘zlashtirilgan?'],
    keywords: ["o'zlashtiril", 'topic', 'yomon o', 'zaif mavzu'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const groupFilter = await scopedGroupFilter(context);
      const rows = await prisma.topicMastery.groupBy({
        by: ['topicId'],
        where: { score: { not: null }, student: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] }, group: groupFilter } },
        _avg: { score: true },
        _count: { _all: true },
      });
      const settings = await getMasterySettings();
      const weak = rows.filter((row) => row._count._all >= 2 && (row._avg.score ?? 100) < settings.thresholds.good).sort((a, b) => (a._avg.score ?? 0) - (b._avg.score ?? 0));
      if (weak.length === 0) return { answer: 'Baholangan mavzular orasida zaif o‘zlashtirilgani yo‘q (yoki ma’lumot hali kam).', link: '/teaching' };
      const topics = await prisma.courseTopic.findMany({ where: { id: { in: weak.slice(0, 5).map((row) => row.topicId) } }, select: { id: true, title: true, module: { select: { course: { select: { name: true } } } } } });
      const title = new Map(topics.map((topic) => [topic.id, `${topic.title} (${topic.module.course.name})`]));
      return {
        answer: `${weak.length} mavzu o‘rtacha ${settings.thresholds.good}% dan past o‘zlashtirilgan.`,
        details: weak.slice(0, 5).map((row) => `${title.get(row.topicId) ?? 'Mavzu'} — ${Math.round(row._avg.score ?? 0)}% (${row._count._all} o‘quvchi)`),
        link: '/teaching',
      };
    },
  },
  {
    key: 'homework_most_errors',
    title: 'Eng qiyin kechgan vazifalar',
    samples: ['Qaysi homework eng ko‘p xato bilan topshirilgan?'],
    keywords: ['homework', 'xato', 'qiyin vazifa'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const groupFilter = await scopedGroupFilter(context);
      const rows = await prisma.homeworkSubmission.findMany({
        where: { score: { not: null }, homework: { status: { not: 'DRAFT' }, deadline: { gte: new Date(context.now.getTime() - 60 * DAY) }, group: groupFilter } },
        select: { score: true, homework: { select: { id: true, title: true, maxPoints: true, group: { select: { name: true } } } } },
      });
      const byHomework = new Map<string, { title: string; group: string; sum: number; count: number }>();
      for (const row of rows) {
        const entry = byHomework.get(row.homework.id) ?? { title: row.homework.title, group: row.homework.group.name, sum: 0, count: 0 };
        entry.sum += ((row.score ?? 0) / Math.max(1, row.homework.maxPoints)) * 100;
        entry.count += 1;
        byHomework.set(row.homework.id, entry);
      }
      const ranked = [...byHomework.values()].filter((entry) => entry.count >= 2).map((entry) => ({ ...entry, average: Math.round(entry.sum / entry.count) })).sort((a, b) => a.average - b.average);
      if (ranked.length === 0) return { answer: 'Oxirgi 60 kunda yetarli baholangan vazifa yo‘q.', link: '/homework' };
      return {
        answer: `Eng past o‘rtacha ball: «${ranked[0]!.title}» — ${ranked[0]!.average}%.`,
        details: ranked.slice(0, 5).map((entry) => `${entry.title} (${entry.group}) — o‘rtacha ${entry.average}%, ${entry.count} ta baho`),
        link: '/homework',
      };
    },
  },
  {
    key: 'declining_students',
    title: 'Natijasi pasayayotgan o‘quvchilar',
    samples: ['Qaysi studentning natijasi pasaymoqda?'],
    keywords: ['pasaymoqda', 'pasay', 'tushib ketdi', 'yomonlash'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const { rows } = await visibleStudents(context);
      const declining = rows
        .map((row) => ({ row, trend: row.factors.find((factor) => factor.key === 'examTrend') }))
        .filter((item) => item.trend && item.trend.score !== null && item.trend.score < 75)
        .sort((a, b) => (a.trend!.score ?? 0) - (b.trend!.score ?? 0));
      if (declining.length === 0) return { answer: 'Imtihon natijasi sezilarli pasaygan o‘quvchi yo‘q.', link: '/teaching' };
      return {
        answer: `${declining.length} o‘quvchining imtihon natijasi pasaymoqda.`,
        details: declining.slice(0, 7).map((item) => `${item.row.firstName} ${item.row.lastName} (${item.row.groupName}) — ${item.trend!.value}`),
        link: '/teaching',
      };
    },
  },
  {
    key: 'groups_at_risk',
    title: 'Xavf ostidagi guruhlar',
    samples: ['Qaysi guruhlar xavfda?'],
    keywords: ['guruhlar xavf', 'guruh xavf', 'guruh'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const overview = await teachingService.overview(context.actor, {}, context.now);
      const ranked = overview.groups
        .map((group) => ({ group, share: group.students === 0 ? 0 : Math.round(((group.risk.AT_RISK + group.risk.CRITICAL) / group.students) * 100) }))
        .filter((item) => item.share > 0 || (item.group.attendanceRate ?? 100) < 70 || (item.group.homeworkRate ?? 100) < 60)
        .sort((a, b) => b.share - a.share);
      if (ranked.length === 0) return { answer: 'Barcha faol guruhlar barqaror ko‘rinadi.', link: '/teaching' };
      return {
        answer: `${ranked.length} guruhda muammo belgilari bor.`,
        details: ranked.slice(0, 5).map(
          ({ group, share }) => `${group.name} — xavf ostida ${share}%, davomat ${group.attendanceRate ?? '—'}%, vazifa ${group.homeworkRate ?? '—'}%, imtihon ${group.examAverage ?? '—'}%`,
        ),
        link: '/teaching',
      };
    },
  },
  {
    key: 'course_performance',
    title: 'Kurslar bo‘yicha akademik natija',
    samples: ['Qaysi kurslarda academic performance pasaygan?'],
    keywords: ['academic performance', 'akademik natija', 'kurslarda'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const groupFilter = await scopedGroupFilter(context);
      const rows = await prisma.examResult.findMany({
        where: { exam: { status: { not: 'CANCELLED' }, date: { gte: new Date(context.now.getTime() - 60 * DAY) }, group: groupFilter } },
        select: { percentage: true, exam: { select: { date: true, group: { select: { course: { select: { id: true, name: true } } } } } } },
      });
      const split = context.now.getTime() - 30 * DAY;
      const byCourse = new Map<string, { name: string; recent: number[]; previous: number[] }>();
      for (const row of rows) {
        const course = row.exam.group.course;
        const entry = byCourse.get(course.id) ?? { name: course.name, recent: [], previous: [] };
        (row.exam.date.getTime() >= split ? entry.recent : entry.previous).push(row.percentage);
        byCourse.set(course.id, entry);
      }
      const mean = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      const changes = [...byCourse.values()]
        .filter((entry) => entry.recent.length > 0 && entry.previous.length > 0)
        .map((entry) => ({ name: entry.name, before: mean(entry.previous), after: mean(entry.recent) }))
        .sort((a, b) => a.after - a.before - (b.after - b.before));
      if (changes.length === 0) return { answer: 'Solishtirish uchun ikki oylik imtihon ma’lumoti yetarli emas.', link: '/exams' };
      const declined = changes.filter((change) => change.after < change.before);
      return {
        answer: declined.length ? `${declined.length} kursda imtihon o‘rtachasi pasaygan (oxirgi 30 kun vs oldingi 30 kun).` : 'Kurslarda imtihon natijasi pasaymagan.',
        details: changes.slice(0, 5).map((change) => `${change.name}: ${change.before}% → ${change.after}%`),
        link: '/exams',
      };
    },
  },
  {
    key: 'teacher_support',
    title: 'Akademik yordam kerak bo‘lgan o‘qituvchilar',
    samples: ['Qaysi teacherga academic support kerak?'],
    keywords: ['teacher', 'support', "o'qituvchiga yordam", 'academic support'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const overview = await teachingService.overview(context.actor, {}, context.now);
      const byTeacher = new Map<string, { name: string; students: number; atRisk: number; scores: number[] }>();
      for (const group of overview.groups) {
        if (!group.teacher) continue;
        const entry = byTeacher.get(group.teacher.id) ?? { name: `${group.teacher.firstName} ${group.teacher.lastName}`, students: 0, atRisk: 0, scores: [] };
        entry.students += group.students;
        entry.atRisk += group.risk.AT_RISK + group.risk.CRITICAL;
        for (const value of [group.attendanceRate, group.homeworkRate, group.examAverage, group.progress]) if (value !== null) entry.scores.push(value);
        byTeacher.set(group.teacher.id, entry);
      }
      const ranked = [...byTeacher.values()]
        .map((entry) => ({ ...entry, composite: entry.scores.length ? Math.round(entry.scores.reduce((sum, value) => sum + value, 0) / entry.scores.length) : null, share: entry.students ? Math.round((entry.atRisk / entry.students) * 100) : 0 }))
        .sort((a, b) => (a.composite ?? 101) - (b.composite ?? 101) || b.share - a.share);
      if (ranked.length === 0) return { answer: 'Faol guruhli o‘qituvchi topilmadi.', link: '/teaching' };
      return {
        answer: `Eng past akademik ko‘rsatkich: ${ranked[0]!.name} (${ranked[0]!.composite ?? '—'}%). Bu baho emas — qo‘llab-quvvatlash uchun signal.`,
        details: ranked.slice(0, 5).map((entry) => `${entry.name} — o‘rtacha ko‘rsatkich ${entry.composite ?? '—'}%, xavf ostida ${entry.share}% (${entry.atRisk}/${entry.students})`),
        link: '/teaching',
      };
    },
  },
  {
    key: 'academy_today',
    title: 'Akademiyadagi bugungi muammolar',
    samples: ['Bugun akademiyada qanday muammo bor?'],
    keywords: ['akademiya', 'muammo', 'bugungi holat'],
    permission: PERMISSIONS.AI_ACADEMIC,
    async run(context) {
      const overview = await teachingService.overview(context.actor, {}, context.now);
      const { totals } = overview;
      const details = [
        `Bugun darsi bor guruhlar: ${totals.lessonsToday}, davomati belgilanmagan: ${totals.unmarkedToday}`,
        `Xavf ostidagi o‘quvchilar: ${totals.atRisk} / ${totals.students}`,
        `Baholash kutayotgan vazifalar: ${totals.homeworkToGrade}`,
        `Tekshirish kutayotgan imtihon urinishlari: ${totals.attemptsToReview}`,
      ];
      const problems = [totals.unmarkedToday, totals.atRisk, totals.homeworkToGrade, totals.attemptsToReview].filter((value) => value > 0).length;
      return {
        answer: problems === 0 ? 'Bugun akademik jihatdan jiddiy muammo ko‘rinmayapti.' : `Bugun ${problems} yo‘nalishda e’tibor kerak.`,
        details,
        link: '/teaching',
      };
    },
  },
];
