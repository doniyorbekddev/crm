import { z } from 'zod';
import { prisma } from '../../config/database.js';
import type { AiAnalysisKind, AiAnalysisStatus, Prisma, RiskLevel } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { addDays, businessDateString, dateColumn } from '../../utils/dates.js';
import type { ClientInfo } from '../../utils/requestContext.js';
import { createExamSchema, createHomeworkSchema } from '../../validators/homework.validator.js';
import { auditService } from '../audit.service.js';
import { examService } from '../exam.service.js';
import { homeworkService } from '../homework.service.js';
import { buildStudentMastery, masteryService } from '../mastery.service.js';
import { studentService } from '../student.service.js';
import { studentRiskService } from '../studentRisk.service.js';
import { teachingService } from '../teaching.service.js';
import { assertGroupVisible, getTeachingAccess } from '../teachingAccess.js';
import type { WeeklyReportDto } from '../weeklyReport.service.js';
import { ACADEMIC_SYSTEM_PROMPT, completeJson, llmAvailable } from './llm.js';
import { codeFindings, similarPairs } from './similarity.js';
import type { CodeFinding } from './similarity.js';

/**
 * AI akademik markaz (TZ 3.0 §30–41).
 *
 * Arxitektura (§61): so'rov → ruxsat va doira (o'qituvchi faqat o'z guruhi) → **whitelist
 * ma'lumot funksiyalari** (mavjud servislar: risk, mastery, o'qituvchi markazi, vazifa) →
 * qoidalar tahlili → (ixtiyoriy) til modeli matnni boyitadi → saqlash va audit.
 *
 * Gallyutsinatsiya nazorati (§60): **FACT** bandlari faqat kod bilan, CRM raqamlaridan yoziladi.
 * Til modeli faktlarni ko'radi va faqat OBSERVATION / RECOMMENDATION / xulosa yozadi; javob sxema
 * bilan tekshiriladi, mos kelmasa qoidalar natijasi qoladi. Modelga ism, telefon, to'lov summasi
 * yuborilmaydi (§59). Deterministik risk darajasi **o'zgartirilmaydi** (§32) — u fakt sifatida
 * keltiriladi.
 */

export type InsightType = 'FACT' | 'OBSERVATION' | 'RECOMMENDATION';
export interface Insight {
  type: InsightType;
  text: string;
}

export interface AiAnalysisDto {
  id: string;
  kind: AiAnalysisKind;
  subjectType: string;
  subjectId: string;
  status: AiAnalysisStatus;
  source: 'RULES' | 'LLM';
  summary: string;
  result: Record<string, unknown> & { items: Insight[] };
  model: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  decidedAt: string | null;
  decision: Record<string, unknown> | null;
}

const DAY = 86_400_000;
const RISK_LABELS: Record<RiskLevel, string> = { HEALTHY: 'barqaror', ATTENTION: 'e’tibor kerak', AT_RISK: 'xavf ostida', CRITICAL: 'kritik' };

const insightSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  observations: z.array(z.string().trim().min(1).max(300)).max(5),
  recommendations: z.array(z.string().trim().min(1).max(300)).max(5),
});

const analysisSelect = {
  id: true,
  kind: true,
  subjectType: true,
  subjectId: true,
  status: true,
  source: true,
  summary: true,
  result: true,
  model: true,
  createdAt: true,
  decidedAt: true,
  decision: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AiAnalysisSelect;

type AnalysisRecord = Prisma.AiAnalysisGetPayload<{ select: typeof analysisSelect }>;

function toDto(row: AnalysisRecord): AiAnalysisDto {
  return {
    ...row,
    result: row.result as AiAnalysisDto['result'],
    decision: (row.decision as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

const pct = (part: number, total: number) => (total === 0 ? null : Math.round((part / total) * 100));
const avg = (values: Array<number | null | undefined>) => {
  const scored = values.filter((value): value is number => typeof value === 'number');
  return scored.length === 0 ? null : Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
};
const arrow = (before: number | null, after: number | null) => (before === null || after === null ? null : `${before}% → ${after}%`);

/** Qoidalar + (ixtiyoriy) model: faktlar o'zgarmaydi, kuzatuv/tavsiya/xulosa model bilan boyitiladi */
async function enrich(
  purpose: string,
  facts: string[],
  ruleObservations: string[],
  ruleRecommendations: string[],
  ruleSummary: string,
  context: Record<string, unknown>,
  audience: string,
) {
  const llm = llmAvailable()
    ? await completeJson(
        {
          system: ACADEMIC_SYSTEM_PROMPT,
          prompt: [
            `Vazifa: ${audience} uchun qisqa akademik tahlil.`,
            'FAKTLAR (o‘zgartirma, takrorlama):',
            ...facts.map((fact, index) => `${index + 1}. ${fact}`),
            `Qo‘shimcha ma’lumot (JSON): ${JSON.stringify(context)}`,
            'Qaytar: {"summary": "2-3 gap", "observations": ["..."], "recommendations": ["..."]}',
          ].join('\n'),
          maxTokens: 900,
        },
        insightSchema,
        purpose,
      )
    : null;
  const observations = llm?.data.observations.length ? llm.data.observations : ruleObservations;
  const recommendations = llm?.data.recommendations.length ? llm.data.recommendations : ruleRecommendations;
  const items: Insight[] = [
    ...facts.map((text) => ({ type: 'FACT' as const, text })),
    ...observations.map((text) => ({ type: 'OBSERVATION' as const, text })),
    ...recommendations.map((text) => ({ type: 'RECOMMENDATION' as const, text })),
  ];
  return {
    items,
    summary: llm?.data.summary ?? ruleSummary,
    source: llm ? ('LLM' as const) : ('RULES' as const),
    model: llm?.model ?? null,
    inputTokens: llm?.inputTokens ?? null,
    outputTokens: llm?.outputTokens ?? null,
  };
}

/** Audit ob'ekti: vazifa tahlili — vazifa ID si (o'quvchi metadata'da), qolganlari — o'zi */
function auditEntity(subjectType: string, subjectId: string): { entityType: string; entityId: string; extra: Record<string, string> } {
  if (subjectType !== 'submission') return { entityType: subjectType, entityId: subjectId, extra: {} };
  const [homeworkId, studentId] = subjectId.split(':');
  return { entityType: 'homework', entityId: homeworkId!, extra: { studentId: studentId! } };
}

async function save(
  actor: AuthUser | null,
  input: {
    kind: AiAnalysisKind;
    subjectType: string;
    subjectId: string;
    periodKey?: string | null;
    summary: string;
    result: Record<string, unknown>;
    source: 'RULES' | 'LLM';
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
  },
  client: ClientInfo | null,
): Promise<AiAnalysisDto> {
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.aiAnalysis.create({
      data: {
        kind: input.kind,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        periodKey: input.periodKey ?? null,
        summary: input.summary.slice(0, 2000),
        result: input.result as Prisma.InputJsonValue,
        source: input.source,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        createdById: actor?.id ?? null,
      },
      select: analysisSelect,
    });
    if (actor) {
      const entity = auditEntity(input.subjectType, input.subjectId);
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'ai.analysis_created',
        entityType: entity.entityType,
        entityId: entity.entityId,
        metadata: { kind: input.kind, analysisId: row.id, source: input.source, model: input.model, ...entity.extra },
        ip: client?.ip ?? null,
        userAgent: client?.userAgent ?? null,
      });
    }
    return row;
  });
  return toDto(created);
}

async function latest(kind: AiAnalysisKind, subjectType: string, subjectId: string): Promise<AiAnalysisDto | null> {
  const row = await prisma.aiAnalysis.findFirst({ where: { kind, subjectType, subjectId }, orderBy: { createdAt: 'desc' }, select: analysisSelect });
  return row ? toDto(row) : null;
}

// ---------------------------------------------------------------------------
// Whitelist ma'lumot funksiyalari (§58): faqat mavjud servislar, faqat kerakli maydonlar
// ---------------------------------------------------------------------------

/** O'quvchi davomati va vazifasining 30 kunlik ikki oynasi (trend: oldin → hozir) */
async function studentTrends(studentId: string, now: Date) {
  const recentFrom = new Date(now.getTime() - 30 * DAY);
  const previousFrom = new Date(now.getTime() - 60 * DAY);
  const [attendance, homework] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId, status: { not: 'EXCUSED' }, date: { gte: dateColumn(previousFrom) } },
      select: { date: true, status: true },
    }),
    prisma.homeworkSubmission.findMany({
      where: { studentId, homework: { status: { not: 'DRAFT' }, deadline: { gte: previousFrom, lt: now } } },
      select: { status: true, homework: { select: { deadline: true } } },
    }),
  ]);
  const split = <T>(rows: T[], dateOf: (row: T) => Date) => ({
    recent: rows.filter((row) => dateOf(row) >= dateColumn(recentFrom)),
    previous: rows.filter((row) => dateOf(row) < dateColumn(recentFrom)),
  });
  const att = split(attendance, (row) => row.date);
  const hw = split(homework, (row) => row.homework.deadline);
  const attended = (rows: typeof attendance) => rows.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').length;
  const done = (rows: typeof homework) => rows.filter((row) => ['SUBMITTED', 'LATE', 'GRADED'].includes(row.status)).length;
  return {
    attendance: { recent: pct(attended(att.recent), att.recent.length), previous: pct(attended(att.previous), att.previous.length) },
    homework: { recent: pct(done(hw.recent), hw.recent.length), previous: pct(done(hw.previous), hw.previous.length) },
  };
}

async function lessonCompletion(studentId: string, courseId: string): Promise<number | null> {
  const [published, completed] = await Promise.all([
    prisma.lesson.count({ where: { status: 'PUBLISHED', topic: { module: { courseId } } } }),
    prisma.lessonProgress.count({ where: { studentId, completedAt: { not: null }, lesson: { status: 'PUBLISHED', topic: { module: { courseId } } } } }),
  ]);
  return pct(completed, published);
}

// ---------------------------------------------------------------------------
// Tahlillar
// ---------------------------------------------------------------------------

/** §32–33: o'quvchi tahlili — 5 ball, deterministik risk, sabablar raqamlar bilan */
async function analyzeStudent(actor: AuthUser, studentId: string, client: ClientInfo, now: Date = new Date()): Promise<AiAnalysisDto> {
  const student = await studentService.getById(actor, studentId);
  const [riskMap, mastery, trends, lessons] = await Promise.all([
    studentRiskService.forStudents([studentId], now),
    buildStudentMastery(studentId),
    studentTrends(studentId, now),
    lessonCompletion(studentId, student.course.id),
  ]);
  const risk = riskMap.get(studentId);
  const factor = (key: string) => risk?.factors.find((item) => item.key === key);
  const gradedAverage = await prisma.homeworkSubmission.findMany({
    where: { studentId, score: { not: null }, homework: { status: { not: 'DRAFT' }, deadline: { gte: new Date(now.getTime() - 60 * DAY) } } },
    select: { score: true, homework: { select: { maxPoints: true } } },
  });
  const homeworkQuality = avg(gradedAverage.map((row) => Math.round(((row.score ?? 0) / Math.max(1, row.homework.maxPoints)) * 100)));

  const scores = {
    attendance: risk?.metrics.attendanceRate ?? trends.attendance.recent,
    homework: avg([risk?.metrics.homeworkRate, homeworkQuality]),
    assessment: risk?.metrics.examAverage ?? null,
    engagement: avg([factor('activity')?.score, factor('login')?.score, lessons]),
    academic: mastery.overall.score ?? avg([homeworkQuality, risk?.metrics.examAverage]),
  };

  const topics = mastery.modules.flatMap((module) => module.topics);
  const weak = topics.filter((topic) => topic.level === 'WEAK' || topic.level === 'DEVELOPING').slice(0, 5);
  const strong = topics.filter((topic) => topic.status === 'MASTERED').slice(0, 5);

  const facts: string[] = [];
  if (risk?.riskLevel) facts.push(`Deterministik risk bahosi: ${RISK_LABELS[risk.riskLevel]} (sog‘lik ${risk.healthScore}/100).`);
  const attendanceTrend = arrow(trends.attendance.previous, trends.attendance.recent);
  if (attendanceTrend) facts.push(`Davomat (30 kunlik): ${attendanceTrend}.`);
  else if (scores.attendance !== null) facts.push(`Davomat: ${scores.attendance}%.`);
  const homeworkTrend = arrow(trends.homework.previous, trends.homework.recent);
  if (homeworkTrend) facts.push(`Vazifa topshirish: ${homeworkTrend}.`);
  else if (risk?.metrics.homeworkRate != null) facts.push(`Vazifa topshirish: ${risk.metrics.homeworkRate}%.`);
  if (homeworkQuality !== null) facts.push(`Baholangan vazifalar o‘rtachasi: ${homeworkQuality}%.`);
  const examTrend = factor('examTrend');
  if (examTrend?.score !== null && examTrend?.score !== undefined) facts.push(`Imtihon: ${examTrend.value}.`);
  else if (scores.assessment !== null) facts.push(`Imtihon o‘rtachasi (90 kun): ${scores.assessment}%.`);
  if (mastery.overall.score !== null) facts.push(`Mavzular o‘zlashtirishi: o‘rtacha ${mastery.overall.score}%, ${mastery.overall.mastered}/${mastery.overall.topics} mavzu o‘zlashtirilgan.`);
  const activity = factor('activity');
  if (activity && activity.value !== '—') facts.push(`Oxirgi faollik: ${activity.value}.`);
  const login = factor('login');
  if (login && risk?.metrics.hasPortalAccount) facts.push(`Kabinetga kirish: ${login.value}.`);
  if (facts.length === 0) facts.push('Tahlil uchun hali yetarli ma’lumot yo‘q (davomat, vazifa yoki imtihon natijasi kiritilmagan).');

  const observations: string[] = [];
  const absences = factor('absences');
  if (absences?.score !== null && absences?.score !== undefined && absences.score < 60) observations.push(`Ketma-ket ${absences.value} darsga kelmagan.`);
  const missed = factor('missedHomework');
  if (missed?.score !== null && missed?.score !== undefined && missed.score < 60) observations.push(`Oxirgi vazifalardan ${missed.value} ketma-ket topshirilmagan.`);
  if (trends.attendance.previous !== null && trends.attendance.recent !== null && trends.attendance.previous - trends.attendance.recent >= 15) observations.push('Davomat oldingi oyga nisbatan sezilarli pasaygan.');
  if (examTrend?.score !== null && examTrend?.score !== undefined && examTrend.score < 60) observations.push('Imtihon natijalari pasayish tendensiyasida.');
  if (weak.length) observations.push(`Qiyinchilik bor mavzular: ${weak.map((topic) => `${topic.title}${topic.score === null ? '' : ` (${topic.score}%)`}`).join(', ')}.`);
  if (strong.length) observations.push(`Yaxshi o‘zlashtirilgan: ${strong.map((topic) => topic.title).join(', ')}.`);

  const recommendations: string[] = [];
  if (weak.length) recommendations.push(`${weak[0]!.title} mavzusi bo‘yicha remedial reja: takrorlash darsi, kichik vazifa va 10 savollik quiz.`);
  if (observations.some((text) => text.includes('darsga kelmagan') || text.includes('Davomat'))) recommendations.push('O‘quvchi bilan qisqa suhbat va kerak bo‘lsa ota-onaga yumshoq murojaat foydali bo‘lishi mumkin.');
  if (missed?.score !== null && missed?.score !== undefined && missed.score < 60) recommendations.push('Vazifani kichik bosqichlarga bo‘lib berish va muddatdan oldin eslatish tavsiya etiladi.');
  if (recommendations.length === 0) recommendations.push('Joriy sur’atni saqlash; qiziqish uchun qo‘shimcha murakkabroq topshiriq taklif qilish mumkin.');

  const ruleSummary =
    risk?.riskLevel && (risk.riskLevel === 'AT_RISK' || risk.riskLevel === 'CRITICAL')
      ? `O‘quvchiga e’tibor kerak: ${risk.reasons.slice(0, 2).join('; ') || 'bir nechta ko‘rsatkich past'}.`
      : risk?.riskLevel === 'ATTENTION'
        ? 'Umumiy holat qoniqarli, lekin ayrim ko‘rsatkichlarni kuzatish kerak.'
        : 'O‘quvchining akademik holati barqaror.';

  const enriched = await enrich('student_analysis', facts, observations, recommendations, ruleSummary, { scores, weakTopics: weak.map((topic) => topic.title), strongTopics: strong.map((topic) => topic.title) }, 'O‘qituvchi');
  return save(
    actor,
    {
      kind: 'STUDENT',
      subjectType: 'student',
      subjectId: studentId,
      summary: enriched.summary,
      result: { scores, riskLevel: risk?.riskLevel ?? null, healthScore: risk?.healthScore ?? null, items: enriched.items, weakTopics: weak.map((topic) => ({ id: topic.topicId, title: topic.title, score: topic.score })) },
      source: enriched.source,
      model: enriched.model,
      inputTokens: enriched.inputTokens,
      outputTokens: enriched.outputTokens,
    },
    client,
  );
}

/** §38: guruh tahlili — kuchli/zaif mavzular, ko'rsatkichlar, tavsiya etilgan amallar */
async function analyzeGroup(actor: AuthUser, groupId: string, client: ClientInfo, now: Date = new Date()): Promise<AiAnalysisDto> {
  const [overview, matrix] = await Promise.all([teachingService.group(actor, groupId, now), masteryService.forGroup(actor, groupId)]);
  const settings = matrix.settings;
  const scored = matrix.topics.filter((topic) => topic.average !== null);
  const strong = scored.filter((topic) => topic.average! >= settings.thresholds.good).sort((a, b) => b.average! - a.average!).slice(0, 3);
  const weak = scored.filter((topic) => topic.average! < settings.thresholds.good).sort((a, b) => a.average! - b.average!).slice(0, 3);
  const card = overview.group;
  const atRisk = card.risk.AT_RISK + card.risk.CRITICAL;

  const facts = [
    `O‘quvchilar: ${card.students}; xavf ostida: ${atRisk}.`,
    ...(card.attendanceRate !== null ? [`Davomat: ${card.attendanceRate}%.`] : []),
    ...(card.homeworkRate !== null ? [`Vazifa topshirish: ${card.homeworkRate}%.`] : []),
    ...(card.examAverage !== null ? [`Imtihon o‘rtachasi: ${card.examAverage}%.`] : []),
    ...(card.progress !== null ? [`Mavzular o‘zlashtirishi: ${card.progress}%.`] : []),
    ...(strong.length ? [`Kuchli mavzular: ${strong.map((topic) => `${topic.title} (${topic.average}%)`).join(', ')}.`] : []),
    ...(weak.length ? [`Zaif mavzular: ${weak.map((topic) => `${topic.title} (${topic.average}%)`).join(', ')}.`] : []),
  ];
  const observations = [
    ...(atRisk > 0 ? [`${atRisk} o‘quvchida xavf belgilari bor: ${overview.students.filter((row) => row.riskLevel === 'AT_RISK' || row.riskLevel === 'CRITICAL').slice(0, 3).map((row) => row.reasons[0] ?? '').filter(Boolean).join('; ')}.`] : []),
    ...(card.homeworkRate !== null && card.homeworkRate < 70 ? ['Vazifa topshirish darajasi past — muddat va hajmni ko‘rib chiqish mumkin.'] : []),
  ];
  const actions = weak.map((topic) => ({ type: 'REMEDIAL', topicId: topic.id, title: topic.title, text: `${topic.title}: mustahkamlash darsi va 10 savollik quiz` }));
  const recommendations = weak.length
    ? weak.map((topic) => `${topic.title} bo‘yicha mustahkamlash darsi va 10 savollik quiz tayyorlash.`)
    : ['Guruh sur’ati yaxshi — keyingi mavzuga o‘tish yoki loyiha ishi berish mumkin.'];
  const ruleSummary = weak.length ? `Guruhda ${weak.map((topic) => topic.title).join(', ')} mavzularini mustahkamlash kerak.` : 'Guruh mavzularni yaxshi o‘zlashtirmoqda.';
  const enriched = await enrich('group_analysis', facts, observations, recommendations, ruleSummary, { metrics: { attendance: card.attendanceRate, homework: card.homeworkRate, exam: card.examAverage, progress: card.progress, atRisk } }, 'O‘qituvchi');
  return save(
    actor,
    {
      kind: 'GROUP',
      subjectType: 'group',
      subjectId: groupId,
      summary: enriched.summary,
      result: {
        metrics: { students: card.students, attendanceRate: card.attendanceRate, homeworkRate: card.homeworkRate, examAverage: card.examAverage, progress: card.progress, atRisk },
        strongTopics: strong.map((topic) => ({ id: topic.id, title: topic.title, average: topic.average })),
        weakTopics: weak.map((topic) => ({ id: topic.id, title: topic.title, average: topic.average })),
        actions,
        items: enriched.items,
      },
      source: enriched.source,
      model: enriched.model,
      inputTokens: enriched.inputTokens,
      outputTokens: enriched.outputTokens,
    },
    client,
  );
}

const homeworkReviewSchema = z.object({
  correctness: z.number().int().min(0).max(100),
  completeness: z.number().int().min(0).max(100),
  quality: z.number().int().min(0).max(100),
  understanding: z.number().int().min(0).max(100),
  suggestedScore: z.number().int().min(0),
  errors: z.array(z.string().trim().min(1).max(300)).max(8),
  suggestions: z.array(z.string().trim().min(1).max(300)).max(8),
  summary: z.string().trim().min(1).max(600),
});

/** §34–36: vazifa tekshiruvi — mezonlar, xatolar, tavsiyalar, taklif balli, o'xshashlik signali */
async function reviewSubmission(actor: AuthUser, homeworkId: string, studentId: string, client: ClientInfo): Promise<AiAnalysisDto> {
  // Ko'rinish: o'qituvchi faqat o'z guruhi vazifasi (homeworkService doirasi)
  const submission = await homeworkService.submissionDetail(actor, homeworkId, studentId);
  const homework = await prisma.homework.findUniqueOrThrow({
    where: { id: homeworkId },
    select: { title: true, description: true, maxPoints: true, rubric: { select: { criteria: true } }, topic: { select: { title: true } } },
  });
  const text = submission.answerText?.trim() ?? '';
  const code = submission.codeText?.trim() ?? '';
  const hasContent = Boolean(text || code || submission.linkUrl || submission.files.length);
  if (!hasContent) throw AppError.unprocessable('O‘quvchi hali javob topshirmagan');

  const findings: CodeFinding[] = code ? codeFindings(code, submission.codeLanguage) : [];
  const others = await prisma.homeworkSubmission.findMany({
    where: { homeworkId, OR: [{ answerText: { not: null } }, { codeText: { not: null } }, { linkUrl: { not: null } }] },
    select: { studentId: true, answerText: true, codeText: true, linkUrl: true, student: { select: { firstName: true, lastName: true } } },
  });
  const pairs = similarPairs(others.map((row) => ({ id: row.studentId, text: `${row.answerText ?? ''}\n${row.codeText ?? ''}`, linkUrl: row.linkUrl })));
  const names = new Map(others.map((row) => [row.studentId, `${row.student.firstName} ${row.student.lastName}`]));
  const similarity = pairs
    .filter((pair) => pair.a === studentId || pair.b === studentId)
    .map((pair) => {
      const other = pair.a === studentId ? pair.b : pair.a;
      return { studentId: other, studentName: names.get(other) ?? '—', score: pair.score, sameLink: pair.sameLink };
    });

  const facts = [
    `Topshirilgan: ${[text && 'matn', code && `kod${submission.codeLanguage ? ` (${submission.codeLanguage})` : ''}`, submission.linkUrl && 'havola', submission.files.length && `${submission.files.length} ta fayl`].filter(Boolean).join(', ')}.`,
    ...(submission.late ? ['Muddatdan kech topshirilgan.'] : []),
    ...findings.map((finding) => `Kod: ${finding.text}.`),
    ...similarity.map((row) => (row.sameLink ? `Bir xil havola: ${row.studentName} bilan (signal, hukm emas).` : `Yuqori o‘xshashlik aniqlandi: ${row.studentName} bilan ${row.score}% (signal, hukm emas).`)),
  ];

  const llm =
    llmAvailable() && (text || code)
      ? await completeJson(
          {
            system: ACADEMIC_SYSTEM_PROMPT,
            prompt: [
              'Vazifa: o‘quvchi javobini tekshir va o‘qituvchiga TAKLIF ber (yakuniy baho o‘qituvchida).',
              `Topshiriq: ${homework.title}${homework.description ? `\nShart: ${homework.description}` : ''}${homework.topic ? `\nMavzu: ${homework.topic.title}` : ''}`,
              `Maksimal ball: ${homework.maxPoints}`,
              ...(homework.rubric ? [`Rubrika mezonlari (JSON): ${JSON.stringify(homework.rubric.criteria)}`] : []),
              ...(text ? [`O‘quvchi matni:\n"""${text.slice(0, 6000)}"""`] : []),
              ...(code ? [`O‘quvchi kodi (${submission.codeLanguage ?? 'noma’lum til'}):\n"""${code.slice(0, 8000)}"""`] : []),
              ...(findings.length ? [`Avtomatik topilmalar: ${findings.map((finding) => finding.text).join('; ')}`] : []),
              'Kod bo‘lsa: to‘g‘rilik, xatolar, sifat, best practice, xavfsizlik, accessibility, tezlik, arxitekturani hisobga ol.',
              `Qaytar: {"correctness":0-100,"completeness":0-100,"quality":0-100,"understanding":0-100,"suggestedScore":0-${homework.maxPoints},"errors":["..."],"suggestions":["..."],"summary":"..."}`,
            ].join('\n'),
            maxTokens: 1400,
          },
          homeworkReviewSchema.refine((value) => value.suggestedScore <= homework.maxPoints, 'ball chegaradan oshdi'),
          'homework_review',
        )
      : null;

  const ruleErrors = findings.filter((finding) => finding.area === 'security' || finding.area === 'completeness').map((finding) => finding.text);
  const ruleSuggestions = findings.filter((finding) => finding.area !== 'security' && finding.area !== 'completeness').map((finding) => finding.text);
  const errors = llm?.data.errors ?? ruleErrors;
  const suggestions = llm?.data.suggestions ?? ruleSuggestions;
  const items: Insight[] = [
    ...facts.map((value) => ({ type: 'FACT' as const, text: value })),
    ...errors.map((value) => ({ type: 'OBSERVATION' as const, text: value })),
    ...suggestions.map((value) => ({ type: 'RECOMMENDATION' as const, text: value })),
  ];
  const summary = llm
    ? `${llm.data.summary} Taklif etilgan ball: ${llm.data.suggestedScore}/${homework.maxPoints}.`
    : 'AI modeli ulanmagan — faqat avtomatik tekshiruvlar va o‘xshashlik signali. Ballni o‘qituvchi qo‘yadi.';
  return save(
    actor,
    {
      kind: 'HOMEWORK_REVIEW',
      subjectType: 'submission',
      subjectId: `${homeworkId}:${studentId}`,
      summary,
      result: {
        homeworkId,
        studentId,
        maxPoints: homework.maxPoints,
        criteria: llm ? { correctness: llm.data.correctness, completeness: llm.data.completeness, quality: llm.data.quality, understanding: llm.data.understanding } : null,
        suggestedScore: llm?.data.suggestedScore ?? null,
        errors,
        suggestions,
        codeFindings: findings,
        similarity,
        filesNote: submission.files.length ? 'Fayllar (rasm/PDF) avtomatik tahlil qilinmaydi — o‘qituvchi ko‘radi.' : null,
        items,
      },
      source: llm ? 'LLM' : 'RULES',
      model: llm?.model ?? null,
      inputTokens: llm?.inputTokens ?? null,
      outputTokens: llm?.outputTokens ?? null,
    },
    client,
  );
}

/** §36: vazifa bo'yicha barcha yuqori o'xshash juftliklar (signal) */
async function homeworkSimilarity(actor: AuthUser, homeworkId: string) {
  const detail = await homeworkService.getById(actor, homeworkId);
  const rows = await prisma.homeworkSubmission.findMany({
    where: { homeworkId, OR: [{ answerText: { not: null } }, { codeText: { not: null } }, { linkUrl: { not: null } }] },
    select: { studentId: true, answerText: true, codeText: true, linkUrl: true },
  });
  const names = new Map(detail.submissions.map((row) => [row.studentId, `${row.firstName} ${row.lastName}`]));
  return similarPairs(rows.map((row) => ({ id: row.studentId, text: `${row.answerText ?? ''}\n${row.codeText ?? ''}`, linkUrl: row.linkUrl }))).map((pair) => ({
    ...pair,
    aName: names.get(pair.a) ?? '—',
    bName: names.get(pair.b) ?? '—',
    label: pair.sameLink ? 'Bir xil havola' : 'Yuqori o‘xshashlik aniqlandi',
  }));
}

/** §41: remedial reja — zaif mavzu → dars → vazifa → quiz → qayta test → mastery (o'qituvchi tasdiqlaydi) */
async function proposeRemedial(actor: AuthUser, input: { groupId: string; topicId: string; studentIds?: string[] | undefined }, client: ClientInfo): Promise<AiAnalysisDto> {
  const access = await getTeachingAccess(actor);
  const group = await assertGroupVisible(access, input.groupId).catch(() => {
    throw AppError.notFound('Guruh topilmadi');
  });
  const topic = await prisma.courseTopic.findFirst({ where: { id: input.topicId, module: { courseId: group.courseId } }, select: { id: true, title: true } });
  if (!topic) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'topicId', message: 'Mavzu guruh kursiga tegishli emas' }]);
  const studentIds = [...new Set(input.studentIds ?? [])];
  if (studentIds.length) {
    const count = await prisma.student.count({ where: { id: { in: studentIds }, groupId: group.id, deletedAt: null } });
    if (count !== studentIds.length) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'studentIds', message: 'O‘quvchilar shu guruhda emas' }]);
  }
  const [lesson, pool, rows] = await Promise.all([
    prisma.lesson.findFirst({ where: { topicId: topic.id, status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } }),
    prisma.question.count({ where: { topicId: topic.id, isActive: true } }),
    prisma.topicMastery.findMany({ where: { topicId: topic.id, student: { groupId: group.id }, ...(studentIds.length ? { studentId: { in: studentIds } } : {}) }, select: { score: true } }),
  ]);
  const quizSize = Math.min(10, pool);
  const average = avg(rows.map((row) => row.score));
  const steps = [
    { kind: 'LESSON', title: lesson ? `Dars: ${lesson.title}` : 'Takrorlash darsi', detail: lesson ? 'Nashr qilingan dars materiali qayta ko‘rib chiqiladi' : 'Bu mavzuda nashr qilingan dars yo‘q — o‘qituvchi darsda takrorlaydi', lessonId: lesson?.id ?? null },
    { kind: 'HOMEWORK', title: `Takrorlash vazifasi: ${topic.title}`, detail: 'Qoralama sifatida yaratiladi — o‘qituvchi tahrirlab e’lon qiladi' },
    ...(quizSize >= 3
      ? [{ kind: 'QUIZ', title: `Takrorlash testi: ${topic.title}`, detail: `${quizSize} savollik onlayn quiz (har o‘quvchiga alohida variant)` }]
      : [{ kind: 'QUIZ', title: 'Quiz o‘tkazib yuboriladi', detail: `Savollar bankida bu mavzuda ${pool} ta savol — kamida 3 ta kerak` }]),
    { kind: 'RETEST', title: 'Qayta test', detail: 'Quizda 2 ta urinish — natija past bo‘lsa qayta topshiriladi' },
    { kind: 'MASTERY', title: 'O‘zlashtirish yangilanadi', detail: 'Vazifa va quiz baholangach mavzu bahosi avtomatik qayta hisoblanadi' },
  ];
  const facts = [
    `Mavzu: ${topic.title}.`,
    ...(average !== null ? [`Hozirgi o‘rtacha o‘zlashtirish: ${average}%.`] : []),
    `Savollar bankida ${pool} ta mavzu savoli.`,
    `Qamrov: ${studentIds.length ? `${studentIds.length} ta tanlangan o‘quvchi` : 'butun guruh'}.`,
  ];
  return save(
    actor,
    {
      kind: 'REMEDIAL',
      subjectType: 'group',
      subjectId: group.id,
      summary: `${topic.title} bo‘yicha remedial reja: ${steps.filter((step) => step.kind !== 'RETEST' && step.kind !== 'MASTERY').length} qadam, o‘qituvchi tasdiqlashi kerak.`,
      result: { groupId: group.id, topic, studentIds, steps, quiz: { questionCount: quizSize >= 3 ? quizSize : 0, poolSize: pool }, lessonId: lesson?.id ?? null, items: facts.map((text) => ({ type: 'FACT', text })) },
      source: 'RULES',
      model: null,
      inputTokens: null,
      outputTokens: null,
    },
    client,
  );
}

/** Tasdiqlash: vazifa bahosi yoki remedial reja amalga oshiriladi (§34 Accept, §41 teacher approves) */
async function accept(actor: AuthUser, analysisId: string, input: { score?: number | undefined; feedback?: string | undefined }, client: ClientInfo): Promise<AiAnalysisDto> {
  const row = await prisma.aiAnalysis.findUnique({ where: { id: analysisId }, select: analysisSelect });
  if (!row) throw AppError.notFound('Tahlil topilmadi');
  if (row.status !== 'READY') throw AppError.unprocessable('Bu tahlil bo‘yicha qaror allaqachon qabul qilingan');
  const result = row.result as Record<string, unknown>;
  let decision: Record<string, unknown>;

  if (row.kind === 'HOMEWORK_REVIEW') {
    const homeworkId = String(result.homeworkId);
    const studentId = String(result.studentId);
    const suggested = typeof result.suggestedScore === 'number' ? result.suggestedScore : null;
    const score = input.score ?? suggested;
    if (score === null) throw AppError.unprocessable('Kiritilgan ma’lumotlar noto‘g‘ri', [{ field: 'score', message: 'AI ball taklif qilmadi — ballni kiriting' }]);
    // Doira va chegaralar homeworkService ichida tekshiriladi (o'z guruhi, maxPoints)
    await homeworkService.grade(actor, homeworkId, studentId, { status: 'GRADED', score, ...(input.feedback ? { feedback: input.feedback } : {}) }, client);
    decision = { score, suggestedScore: suggested, edited: suggested !== null && score !== suggested };
  } else if (row.kind === 'REMEDIAL') {
    const groupId = String(result.groupId);
    const access = await getTeachingAccess(actor);
    await assertGroupVisible(access, groupId).catch(() => {
      throw AppError.notFound('Guruh topilmadi');
    });
    const topic = result.topic as { id: string; title: string };
    const studentIds = (result.studentIds as string[]) ?? [];
    const lessonId = (result.lessonId as string | null) ?? null;
    const deadline = addDays(new Date(), 7);
    const homework = await homeworkService.create(
      actor,
      createHomeworkSchema.parse({
        title: `Takrorlash: ${topic.title}`.slice(0, 200),
        description: 'AI remedial reja asosida (o‘qituvchi tasdiqlagan). Mavzuni takrorlash uchun mashq.',
        groupId,
        deadline: deadline.toISOString(),
        status: 'DRAFT',
        topicId: topic.id,
        lessonId,
        ...(studentIds.length ? { targetType: 'SELECTED', studentIds } : {}),
      }),
      client,
    );
    const questionCount = Number((result.quiz as { questionCount: number }).questionCount ?? 0);
    const exam =
      questionCount >= 3
        ? await examService.create(
            actor,
            createExamSchema.parse({
              title: `Takrorlash testi: ${topic.title}`.slice(0, 200),
              groupId,
              date: businessDateString(deadline),
              type: 'PRACTICE',
              isOnline: true,
              maxAttempts: 2,
              xpReward: 20,
              shuffleOptions: true,
              blueprint: { total: questionCount, topics: [{ topicId: topic.id, percent: 100 }] },
            }),
            client,
          )
        : null;
    decision = { homeworkId: homework.id, examId: exam?.id ?? null };
  } else {
    throw AppError.unprocessable('Bu turdagi tahlil tasdiqlanmaydi');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.aiAnalysis.update({
      where: { id: analysisId },
      data: { status: 'ACCEPTED', decidedById: actor.id, decidedAt: new Date(), decision: decision as Prisma.InputJsonValue },
      select: analysisSelect,
    });
    const entity = auditEntity(row.subjectType, row.subjectId);
    await auditService.recordInTransaction(tx, { userId: actor.id, action: 'ai.analysis_accepted', entityType: entity.entityType, entityId: entity.entityId, metadata: { analysisId, kind: row.kind, ...entity.extra, ...decision } as Prisma.InputJsonValue, ...client });
    return saved;
  });
  return toDto(updated);
}

async function reject(actor: AuthUser, analysisId: string, client: ClientInfo): Promise<AiAnalysisDto> {
  const row = await prisma.aiAnalysis.findUnique({ where: { id: analysisId }, select: { status: true, kind: true, subjectType: true, subjectId: true, result: true } });
  if (!row) throw AppError.notFound('Tahlil topilmadi');
  await assertAnalysisVisible(actor, row);
  if (row.status !== 'READY') throw AppError.unprocessable('Bu tahlil bo‘yicha qaror allaqachon qabul qilingan');
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.aiAnalysis.update({ where: { id: analysisId }, data: { status: 'REJECTED', decidedById: actor.id, decidedAt: new Date() }, select: analysisSelect });
    const entity = auditEntity(row.subjectType, row.subjectId);
    await auditService.recordInTransaction(tx, { userId: actor.id, action: 'ai.analysis_rejected', entityType: entity.entityType, entityId: entity.entityId, metadata: { analysisId, kind: row.kind, ...entity.extra }, ...client });
    return saved;
  });
  return toDto(updated);
}

/** Tahlil ob'ekti xodimga ko'rinadimi (o'qituvchi — o'z guruhi) */
async function assertAnalysisVisible(actor: AuthUser, row: { subjectType: string; subjectId: string; result: unknown }): Promise<void> {
  if (row.subjectType === 'student') {
    await studentService.getById(actor, row.subjectId);
    return;
  }
  if (row.subjectType === 'group') {
    const access = await getTeachingAccess(actor);
    await assertGroupVisible(access, row.subjectId).catch(() => {
      throw AppError.notFound('Tahlil topilmadi');
    });
    return;
  }
  const [homeworkId, studentId] = row.subjectId.split(':');
  await homeworkService.submissionDetail(actor, homeworkId!, studentId!);
}

// ---------------------------------------------------------------------------
// §40: ota-ona uchun haftalik xulosa
// ---------------------------------------------------------------------------

const parentSummarySchema = z.object({ text: z.string().trim().min(20).max(900) });

/**
 * Model ulangan bo'lsa — hisobot faktlaridan yumshoq ohangdagi matn (hafta bo'yicha bir marta, keshda).
 * Ulangan bo'lmasa `null` — hisobotdagi qoidalar xulosasi va tavsiyalar ishlatiladi.
 */
async function parentSummary(report: WeeklyReportDto): Promise<{ text: string; source: 'LLM' } | null> {
  const periodKey = report.week.start;
  const cached = await prisma.aiAnalysis.findFirst({
    where: { kind: 'PARENT_SUMMARY', subjectType: 'student', subjectId: report.student.id, periodKey },
    orderBy: { createdAt: 'desc' },
    select: { summary: true },
  });
  if (cached) return { text: cached.summary, source: 'LLM' };
  if (!llmAvailable()) return null;
  const facts = { ...report, student: undefined, feedback: report.feedback.map((item) => ({ source: item.source, title: item.title, text: item.text })) };
  const llm = await completeJson(
    {
      system: `${ACADEMIC_SYSTEM_PROMPT}\nAuditoriya: ota-ona. Qo‘rqituvchi yoki keskin xulosa yozma, ayblama. Avval yutuqlar, keyin o‘sish imkoniyatlari, oxirida 1-2 amaliy tavsiya.`,
      prompt: `Haftalik hisobot ma’lumoti (JSON): ${JSON.stringify(facts)}\nQaytar: {"text": "4-6 gaplik iliq xulosa"}`,
      maxTokens: 600,
    },
    parentSummarySchema,
    'parent_summary',
  );
  if (!llm) return null;
  await save(null, {
    kind: 'PARENT_SUMMARY',
    subjectType: 'student',
    subjectId: report.student.id,
    periodKey,
    summary: llm.data.text,
    result: { items: [] },
    source: 'LLM',
    model: llm.model,
    inputTokens: llm.inputTokens,
    outputTokens: llm.outputTokens,
  }, null);
  return { text: llm.data.text, source: 'LLM' };
}

export const aiAcademicService = {
  status() {
    return { llm: llmAvailable(), mode: llmAvailable() ? 'LLM' : 'RULES' };
  },
  analyzeStudent,
  async latestStudent(actor: AuthUser, studentId: string) {
    await studentService.getById(actor, studentId);
    return latest('STUDENT', 'student', studentId);
  },
  analyzeGroup,
  async latestGroup(actor: AuthUser, groupId: string) {
    const access = await getTeachingAccess(actor);
    await assertGroupVisible(access, groupId).catch(() => {
      throw AppError.notFound('Guruh topilmadi');
    });
    return latest('GROUP', 'group', groupId);
  },
  reviewSubmission,
  async latestReview(actor: AuthUser, homeworkId: string, studentId: string) {
    await homeworkService.submissionDetail(actor, homeworkId, studentId);
    return latest('HOMEWORK_REVIEW', 'submission', `${homeworkId}:${studentId}`);
  },
  homeworkSimilarity,
  proposeRemedial,
  accept,
  reject,
  parentSummary,
  /** Hisobotga AI xulosasini qo'shadi (bo'lmasa `aiSummary: null`) */
  async withAiSummary(report: WeeklyReportDto): Promise<WeeklyReportDto> {
    const ai = await parentSummary(report).catch(() => null);
    return { ...report, aiSummary: ai?.text ?? null };
  },
};
