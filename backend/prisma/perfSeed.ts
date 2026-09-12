/* eslint-disable no-console -- CLI skript: jarayon natijasi terminalga chiqariladi */
/**
 * Unumdorlik sinovi uchun katta hajmdagi ma'lumot (PHASE 14).
 *
 *   PERF_DATABASE_URL="postgresql://crm:...@localhost:5432/crm_perf" npm run db:perf-seed
 *
 * Xavfsizlik: faqat alohida bazada ishlaydi — URL'da "perf" bo'lishi va DATABASE_URL
 * bilan bir xil bo'lmasligi shart. Oldin oddiy seed ishga tushirilgan bo'lishi kerak
 * (rollar, kassalar, kategoriyalar, manbalar).
 *
 * Hajm (standart): 8 kurs, 20 o'qituvchi, 60 guruh, ~2 400 o'quvchi, ~6 000 dars seansi,
 * ~125 000 davomat, ~12 000 to'lov, 6 000 lead, 8 000 follow-up, ~50 000 uy vazifasi topshirig'i.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  AttendanceStatus,
  DebtStatus,
  LeadStatus,
  PaymentMethod,
  StudentStatus,
  SubmissionStatus,
  WeekDay,
} from '../src/generated/prisma/client.js';

config({ quiet: true });

const url = process.env.PERF_DATABASE_URL?.trim();
if (!url || !url.includes('perf') || url === process.env.DATABASE_URL?.trim()) {
  console.error('PERF_DATABASE_URL alohida "perf" bazasini ko‘rsatishi kerak (DATABASE_URL bilan bir xil bo‘lmasin).');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const SCALE = {
  courses: 8,
  teachers: 20,
  managers: 6,
  groups: 60,
  studentsPerGroup: 20,
  formerStudents: 1_200,
  months: 8,
  paymentsPerStudent: 5,
  expenses: 800,
  incomes: 300,
  leads: 6_000,
  followUps: 8_000,
  xp: 60_000,
  homeworkPerGroup: 40,
  examsPerGroup: 8,
};

const DAY = 86_400_000;

/** Takrorlanadigan tasodifiy sonlar (har safar bir xil ma'lumot) */
let seed = 20260913;
function random(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
function between(min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1));
}

function dateOnly(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

async function insert<T>(label: string, rows: T[], write: (chunk: T[]) => Promise<unknown>, size = 4_000): Promise<void> {
  for (let index = 0; index < rows.length; index += size) {
    await write(rows.slice(index, index + size));
  }
  console.log(`✔ ${label}: ${rows.length.toLocaleString('uz-UZ')}`);
}

const FIRST_NAMES = ['Aziz', 'Madina', 'Anvar', 'Bekzod', 'Dilnoza', 'Jasur', 'Kamola', 'Laziz', 'Nilufar', 'Otabek', 'Sardor', 'Zarina'];
const LAST_NAMES = ['Karimov', 'Valiyeva', 'Rahimov', 'Yusupova', 'Tursunov', 'Aliyeva', 'Nazarov', 'Saidova', 'Qodirov', 'Ergasheva'];
const WEEK_PATTERNS: readonly WeekDay[][] = [
  ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
  ['TUESDAY', 'THURSDAY', 'SATURDAY'],
];
const DAY_INDEX: Record<WeekDay, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };

async function main(): Promise<void> {
  const existing = await prisma.student.count();
  if (existing > 1_000) {
    console.log(`Bazada allaqachon ${existing} o‘quvchi bor — perf seed o‘tkazib yuborildi.`);
    return;
  }

  const now = new Date();
  const start = new Date(now.getTime() - SCALE.months * 30 * DAY);
  const passwordHash = await hash('Perf12345!', 10);

  const roles = await prisma.role.findMany({ select: { id: true, key: true } });
  const roleId = (key: string) => {
    const role = roles.find((row) => row.key === key);
    if (!role) throw new Error(`Rol topilmadi: ${key} — avval oddiy seed ishga tushiring`);
    return role.id;
  };
  const sources = await prisma.source.findMany({ select: { id: true } });
  const cash = await prisma.financialAccount.findFirstOrThrow({ where: { key: 'CASH' }, select: { id: true } });
  const expenseCategories = await prisma.expenseCategory.findMany({ select: { id: true, name: true } });

  // --- Kurslar ---
  const courses = Array.from({ length: SCALE.courses }, (_, index) => ({
    id: randomUUID(),
    name: `Perf kurs ${index + 1}`,
    durationMonths: 6,
    price: 6_000_000,
    finalPrice: 6_000_000,
  }));
  await insert('kurslar', courses, (chunk) => prisma.course.createMany({ data: chunk }));

  // --- Xodimlar ---
  const makeUser = (prefix: string, index: number, role: string) => ({
    id: randomUUID(),
    email: `${prefix}${index + 1}@perf.local`,
    firstName: pick(FIRST_NAMES),
    lastName: pick(LAST_NAMES),
    passwordHash,
    status: 'ACTIVE' as const,
    roleId: roleId(role),
  });
  const teachers = Array.from({ length: SCALE.teachers }, (_, index) => makeUser('teacher', index, 'TEACHER'));
  const managers = Array.from({ length: SCALE.managers }, (_, index) => makeUser('manager', index, 'SALES_MANAGER'));
  await insert('xodimlar', [...teachers, ...managers], (chunk) => prisma.user.createMany({ data: chunk }));

  const profiles = teachers.map((teacher) => ({ id: randomUUID(), userId: teacher.id, specialization: 'Perf', experienceYears: between(1, 10) }));
  await insert('o‘qituvchi profillari', profiles, (chunk) => prisma.teacherProfile.createMany({ data: chunk }));
  await insert(
    'maosh modellari',
    profiles.map((profile) => ({ teacherProfileId: profile.id, type: 'PER_LESSON' as const, perLessonRate: 120_000, effectiveFrom: dateOnly(start) })),
    (chunk) => prisma.teacherSalaryRule.createMany({ data: chunk }),
  );

  // --- Guruhlar ---
  const groups = Array.from({ length: SCALE.groups }, (_, index) => ({
    id: randomUUID(),
    name: `P-${String(index + 1).padStart(3, '0')}`,
    courseId: courses[index % courses.length]!.id,
    teacherId: teachers[index % teachers.length]!.id,
    capacity: 24,
    scheduleDays: WEEK_PATTERNS[index % 2]!,
    startTime: '14:00',
    endTime: '16:00',
    startDate: dateOnly(start),
    status: 'ACTIVE' as const,
  }));
  await insert('guruhlar', groups, (chunk) => prisma.group.createMany({ data: chunk }));

  // --- O'quvchilar ---
  let phone = 900_000_000;
  const makeStudent = (group: (typeof groups)[number], status: StudentStatus) => {
    phone += 1;
    const createdAt = new Date(start.getTime() + random() * (now.getTime() - start.getTime()) * 0.6);
    return {
      id: randomUUID(),
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      phone: `+998${phone}`,
      courseId: group.courseId,
      groupId: group.id,
      contractPrice: 6_000_000,
      startDate: dateOnly(createdAt),
      status,
      statusChangedAt: status === 'ACTIVE' ? null : new Date(createdAt.getTime() + random() * (now.getTime() - createdAt.getTime())),
      createdAt,
    };
  };
  const activeStudents = groups.flatMap((group) => Array.from({ length: SCALE.studentsPerGroup }, () => makeStudent(group, 'ACTIVE')));
  const formerStudents = Array.from({ length: SCALE.formerStudents }, () =>
    makeStudent(pick(groups), pick<StudentStatus>(['DROPPED', 'DROPPED', 'COMPLETED', 'GRADUATED', 'FROZEN'])),
  );
  const students = [...activeStudents, ...formerStudents];
  await insert('o‘quvchilar', students, (chunk) => prisma.student.createMany({ data: chunk }), 2_000);

  // --- To'lovlar, daftar va qarzdorlik ---
  const methods: readonly PaymentMethod[] = ['CASH', 'CASH', 'CARD', 'CLICK', 'PAYME'];
  const transactions: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const debts: Array<{ studentId: string; totalAmount: number; paidAmount: number; remainingAmount: number; status: DebtStatus }> = [];
  for (const student of students) {
    const count = between(1, SCALE.paymentsPerStudent);
    let paid = 0;
    for (let index = 0; index < count && paid < 6_000_000; index += 1) {
      const amount = Math.min(pick([500_000, 1_000_000, 1_000_000, 1_500_000]), 6_000_000 - paid);
      paid += amount;
      const paidAt = new Date(student.createdAt.getTime() + random() * (now.getTime() - student.createdAt.getTime()));
      const transactionId = randomUUID();
      const paymentId = randomUUID();
      transactions.push({
        id: transactionId,
        type: 'INCOME',
        amount,
        accountId: cash.id,
        occurredAt: paidAt,
        categoryName: 'O‘quvchi to‘lovi',
        entityType: 'payment',
        entityId: paymentId,
        description: 'Perf to‘lov',
      });
      payments.push({
        id: paymentId,
        studentId: student.id,
        courseId: student.courseId,
        amount,
        method: pick(methods),
        paidAt,
        managerId: pick(managers).id,
        transactionId,
      });
    }
    debts.push({
      studentId: student.id,
      totalAmount: 6_000_000,
      paidAmount: paid,
      remainingAmount: Math.max(6_000_000 - paid, 0),
      status: paid <= 0 ? 'UNPAID' : paid >= 6_000_000 ? 'PAID' : 'PARTIAL',
    });
  }

  const expenses: Array<Record<string, unknown>> = [];
  for (let index = 0; index < SCALE.expenses; index += 1) {
    const category = pick(expenseCategories);
    const transactionId = randomUUID();
    const spentAt = new Date(start.getTime() + random() * (now.getTime() - start.getTime()));
    const amount = pick([300_000, 800_000, 1_500_000, 4_000_000]);
    transactions.push({ id: transactionId, type: 'EXPENSE', amount, accountId: cash.id, occurredAt: spentAt, categoryName: category.name, entityType: 'expense', description: 'Perf xarajat' });
    expenses.push({ categoryId: category.id, amount, method: 'CASH', accountId: cash.id, spentAt, transactionId });
  }

  await insert('moliyaviy daftar', transactions, (chunk) => prisma.transaction.createMany({ data: chunk as never }));
  await insert('to‘lovlar', payments, (chunk) => prisma.payment.createMany({ data: chunk as never }));
  await insert('xarajatlar', expenses, (chunk) => prisma.expense.createMany({ data: chunk as never }));
  await insert('qarzdorlik', debts, (chunk) => prisma.debt.createMany({ data: chunk }));

  // --- Dars seanslari va davomat ---
  const sessions: Array<{ id: string; groupId: string; teacherId: string; date: Date; status: 'HELD' }> = [];
  const attendance: Array<{ studentId: string; groupId: string; sessionId: string; date: Date; status: AttendanceStatus }> = [];
  const studentsByGroup = new Map<string, string[]>();
  for (const student of activeStudents) {
    const list = studentsByGroup.get(student.groupId) ?? [];
    list.push(student.id);
    studentsByGroup.set(student.groupId, list);
  }
  const statuses: readonly AttendanceStatus[] = [...Array(82).fill('PRESENT'), ...Array(7).fill('LATE'), ...Array(3).fill('EXCUSED'), ...Array(8).fill('ABSENT')];
  for (const group of groups) {
    const days = new Set(group.scheduleDays.map((day) => DAY_INDEX[day]));
    for (let time = dateOnly(start).getTime(); time < now.getTime() - DAY; time += DAY) {
      const date = new Date(time);
      if (!days.has(date.getUTCDay())) continue;
      const sessionId = randomUUID();
      sessions.push({ id: sessionId, groupId: group.id, teacherId: group.teacherId, date, status: 'HELD' });
      for (const studentId of studentsByGroup.get(group.id) ?? []) {
        attendance.push({ studentId, groupId: group.id, sessionId, date, status: pick(statuses) });
      }
    }
  }
  await insert('dars seanslari', sessions, (chunk) => prisma.attendanceSession.createMany({ data: chunk }));
  await insert('davomat', attendance, (chunk) => prisma.attendance.createMany({ data: chunk }), 5_000);

  // --- Leadlar va follow-up ---
  const leadStatuses: readonly LeadStatus[] = ['NEW', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'NEGOTIATION', 'WON', 'LOST', 'CALLBACK'];
  const leads = Array.from({ length: SCALE.leads }, () => {
    phone += 1;
    const createdAt = new Date(start.getTime() + random() * (now.getTime() - start.getTime()));
    const status = pick(leadStatuses);
    return {
      id: randomUUID(),
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      phone: `+998${phone}`,
      status,
      sourceId: pick(sources).id,
      courseId: pick(courses).id,
      assignedToId: pick(managers).id,
      createdAt,
      convertedAt: status === 'WON' ? new Date(createdAt.getTime() + between(1, 20) * DAY) : null,
    };
  });
  await insert('leadlar', leads, (chunk) => prisma.lead.createMany({ data: chunk }), 2_000);
  await insert(
    'follow-up',
    Array.from({ length: SCALE.followUps }, () => {
      const lead = pick(leads);
      const dueAt = new Date(lead.createdAt.getTime() + between(1, 30) * DAY);
      return { leadId: lead.id, assignedToId: lead.assignedToId, title: 'Qayta qo‘ng‘iroq', dueAt, status: dueAt < now && random() < 0.8 ? ('DONE' as const) : ('PENDING' as const) };
    }),
    (chunk) => prisma.followUp.createMany({ data: chunk }),
  );

  // --- XP ---
  const xp = Array.from({ length: SCALE.xp }, () => ({
    studentId: pick(activeStudents).id,
    points: pick([5, 10, 10, 20, 30, 50]),
    source: pick(['ATTENDANCE', 'HOMEWORK', 'EXAM'] as const),
    description: 'Perf XP',
    createdAt: new Date(start.getTime() + random() * (now.getTime() - start.getTime())),
  }));
  await insert('XP yozuvlari', xp, (chunk) => prisma.xpTransaction.createMany({ data: chunk }), 5_000);
  const xpTotals = new Map<string, number>();
  for (const row of xp) xpTotals.set(row.studentId, (xpTotals.get(row.studentId) ?? 0) + row.points);
  await insert(
    'gamification profillari',
    [...xpTotals.entries()].map(([studentId, totalXp]) => ({ studentId, totalXp, levelNumber: totalXp >= 1000 ? 5 : totalXp >= 500 ? 4 : 3 })),
    (chunk) => prisma.gamificationProfile.createMany({ data: chunk }),
  );

  // --- Uy vazifasi va imtihonlar ---
  const homework: Array<{ id: string; title: string; groupId: string; courseId: string; teacherId: string; deadline: Date; assignedAt: Date; maxPoints: number }> = [];
  const submissions: Array<{ homeworkId: string; studentId: string; status: SubmissionStatus; score: number | null; submittedAt: Date | null }> = [];
  const exams: Array<{ id: string; title: string; groupId: string; courseId: string; teacherId: string; date: Date; maxScore: number; status: 'GRADED' }> = [];
  const results: Array<{ examId: string; studentId: string; score: number; percentage: number; grade: string }> = [];
  for (const group of groups) {
    const members = studentsByGroup.get(group.id) ?? [];
    for (let index = 0; index < SCALE.homeworkPerGroup; index += 1) {
      const deadline = new Date(start.getTime() + ((index + 1) / (SCALE.homeworkPerGroup + 1)) * (now.getTime() - start.getTime()));
      const id = randomUUID();
      homework.push({ id, title: `Vazifa ${index + 1}`, groupId: group.id, courseId: group.courseId, teacherId: group.teacherId, deadline, assignedAt: new Date(deadline.getTime() - 5 * DAY), maxPoints: 100 });
      for (const studentId of members) {
        const roll = random();
        const status: SubmissionStatus = roll < 0.7 ? 'GRADED' : roll < 0.78 ? 'LATE' : roll < 0.88 ? 'MISSED' : 'SUBMITTED';
        submissions.push({ homeworkId: id, studentId, status, score: status === 'GRADED' ? between(50, 100) : null, submittedAt: status === 'MISSED' ? null : deadline });
      }
    }
    for (let index = 0; index < SCALE.examsPerGroup; index += 1) {
      const id = randomUUID();
      exams.push({ id, title: `Imtihon ${index + 1}`, groupId: group.id, courseId: group.courseId, teacherId: group.teacherId, date: dateOnly(new Date(start.getTime() + ((index + 1) / (SCALE.examsPerGroup + 1)) * (now.getTime() - start.getTime()))), maxScore: 100, status: 'GRADED' });
      for (const studentId of members) {
        const score = between(40, 100);
        results.push({ examId: id, studentId, score, percentage: score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F' });
      }
    }
  }
  await insert('uy vazifalari', homework, (chunk) => prisma.homework.createMany({ data: chunk }));
  await insert('topshiriqlar', submissions, (chunk) => prisma.homeworkSubmission.createMany({ data: chunk }), 5_000);
  await insert('imtihonlar', exams, (chunk) => prisma.exam.createMany({ data: chunk }));
  await insert('imtihon natijalari', results, (chunk) => prisma.examResult.createMany({ data: chunk }), 5_000);

  // --- Maosh davrlari ---
  const periods = profiles.flatMap((profile) =>
    Array.from({ length: SCALE.months }, (_, index) => {
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
      const total = between(3, 9) * 1_000_000;
      const settled = index > 0;
      return {
        teacherProfileId: profile.id,
        year: month.getUTCFullYear(),
        month: month.getUTCMonth() + 1,
        salaryType: 'PER_LESSON' as const,
        totalAmount: total,
        paidAmount: settled ? total : 0,
        remainingAmount: settled ? 0 : total,
        status: settled ? ('PAID' as const) : ('CALCULATED' as const),
      };
    }),
  );
  await insert('maosh davrlari', periods, (chunk) => prisma.teacherSalaryPeriod.createMany({ data: chunk }));

  console.log('\nPerf seed yakunlandi. Kirish: owner@example.com / Owner123! (oddiy seed hisoblari ham ishlaydi)');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
