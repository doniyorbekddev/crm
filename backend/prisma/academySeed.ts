/**
 * O‘quv markaz modullari uchun seed: ma'lumotnomalar (daraja, nishon, XP qoidalari,
 * hisoblar, kategoriyalar) va demo ma'lumotlar (davomat seanslari, XP, moliya,
 * uy vazifasi, imtihon, maosh davrlari).
 *
 * Ma'lumotnomalar har safar upsert qilinadi — takrorlanmaydi.
 * Demo ma'lumotlar esa faqat baza bo‘sh bo‘lganda yaratiladi.
 */
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  AccountType,
  BadgeRule,
  PaymentMethod,
  SalaryType,
  SubmissionStatus,
  XpSource,
} from '../src/generated/prisma/client.js';

type Log = (message: string) => void;

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Ma'lumotnomalar
// ---------------------------------------------------------------------

const LEVELS: ReadonlyArray<{ number: number; name: string; minXp: number; icon: string }> = [
  { number: 1, name: 'Yangi boshlovchi', minXp: 0, icon: '🌱' },
  { number: 2, name: 'Izlanuvchi', minXp: 100, icon: '📗' },
  { number: 3, name: 'Tirishqoq', minXp: 250, icon: '📘' },
  { number: 4, name: 'Faol o‘quvchi', minXp: 500, icon: '📙' },
  { number: 5, name: 'Kuchli', minXp: 1000, icon: '⭐' },
  { number: 6, name: 'Juda kuchli', minXp: 1750, icon: '🌟' },
  { number: 7, name: 'Ustoz shogirdi', minXp: 2500, icon: '🔥' },
  { number: 8, name: 'Mahoratli', minXp: 3500, icon: '🚀' },
  { number: 9, name: 'Yetuk', minXp: 4500, icon: '💎' },
  { number: 10, name: 'Chempion', minXp: 5000, icon: '👑' },
];

const XP_RULES: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  source: XpSource;
  points: number;
}> = [
  { key: 'ATTENDANCE_PRESENT', name: 'Darsga keldi', description: 'Har bir qatnashgan dars uchun', source: 'ATTENDANCE', points: 10 },
  { key: 'ATTENDANCE_LATE', name: 'Kechikib keldi', description: 'Kechikkan holda qatnashgani uchun', source: 'ATTENDANCE', points: 5 },
  { key: 'HOMEWORK_SUBMITTED', name: 'Uy vazifasini topshirdi', description: 'Vaqtida topshirilgan uy vazifasi', source: 'HOMEWORK', points: 20 },
  { key: 'EXAM_GOOD', name: 'Testdan 90%+', description: 'Imtihon yoki testda yuqori natija', source: 'EXAM', points: 30 },
  { key: 'EXAM_EXCELLENT', name: 'Imtihondan a’lo natija', description: 'Yakuniy imtihonda a’lo baho', source: 'EXAM', points: 50 },
  { key: 'STREAK_7', name: '7 kun ketma-ket', description: 'Bir hafta uzluksiz qatnashish', source: 'STREAK', points: 100 },
  { key: 'REFERRAL', name: 'Do‘st olib keldi', description: 'Tavsiya bo‘yicha kelgan yangi o‘quvchi', source: 'REFERRAL', points: 100 },
  { key: 'COURSE_COMPLETED', name: 'Kursni tugatdi', description: 'Kursni to‘liq yakunlagani uchun', source: 'COURSE_COMPLETED', points: 500 },
];

const BADGES: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  icon: string;
  rule: BadgeRule;
  threshold: number | null;
  xpReward: number;
}> = [
  { key: 'STREAK_7', name: '7 kunlik seriya', description: '7 dars ketma-ket qatnashdi', icon: '🔥', rule: 'STREAK_DAYS', threshold: 7, xpReward: 50 },
  { key: 'STREAK_30', name: '30 kunlik seriya', description: '30 dars ketma-ket qatnashdi', icon: '🔥', rule: 'STREAK_DAYS', threshold: 30, xpReward: 200 },
  { key: 'PERFECT_ATTENDANCE', name: 'Mukammal davomat', description: 'Oy davomida bitta ham dars qoldirmadi', icon: '🏆', rule: 'ATTENDANCE_RATE', threshold: 100, xpReward: 150 },
  { key: 'HOMEWORK_HERO', name: 'Uy vazifasi qahramoni', description: '10 ta uy vazifasini topshirdi', icon: '📚', rule: 'HOMEWORK_COUNT', threshold: 10, xpReward: 100 },
  { key: 'TEST_MASTER', name: 'Test ustasi', description: 'Imtihondan 95%+ oldi', icon: '💯', rule: 'EXAM_SCORE', threshold: 95, xpReward: 100 },
  { key: 'FAST_LEARNER', name: 'Tez o‘rganuvchi', description: '1000 XP to‘pladi', icon: '🚀', rule: 'XP_TOTAL', threshold: 1000, xpReward: 0 },
  { key: 'TOP_STUDENT', name: 'Eng yaxshi o‘quvchi', description: 'Reytingda birinchi o‘rin', icon: '⭐', rule: 'MANUAL', threshold: null, xpReward: 0 },
  { key: 'GOAL_CRUSHER', name: 'Maqsadga erishuvchi', description: 'Kursni muddatidan oldin tugatdi', icon: '🎯', rule: 'COURSE_COMPLETED', threshold: null, xpReward: 200 },
  { key: 'MONTHLY_CHAMPION', name: 'Oy chempioni', description: 'Oylik reyting g‘olibi', icon: '👑', rule: 'MANUAL', threshold: null, xpReward: 300 },
];

const ACCOUNTS: ReadonlyArray<{ key: string; name: string; type: AccountType; sortOrder: number }> = [
  { key: 'CASH', name: 'Naqd kassa', type: 'CASH', sortOrder: 1 },
  { key: 'BANK', name: 'Bank hisobi', type: 'BANK', sortOrder: 2 },
  { key: 'CARD', name: 'Plastik karta', type: 'CARD', sortOrder: 3 },
  { key: 'CLICK', name: 'Click', type: 'CLICK', sortOrder: 4 },
  { key: 'PAYME', name: 'Payme', type: 'PAYME', sortOrder: 5 },
  { key: 'UZUM', name: 'Uzum', type: 'UZUM', sortOrder: 6 },
];

const INCOME_CATEGORIES: ReadonlyArray<{ key: string; name: string; isSystem: boolean }> = [
  { key: 'STUDENT_PAYMENT', name: 'O‘quvchi to‘lovi', isSystem: true },
  { key: 'REGISTRATION', name: 'Ro‘yxatga olish', isSystem: false },
  { key: 'BOOKS', name: 'Kitob va qo‘llanma', isSystem: false },
  { key: 'UNIFORM', name: 'Forma', isSystem: false },
  { key: 'OTHER_INCOME', name: 'Boshqa tushum', isSystem: false },
];

const EXPENSE_CATEGORIES: ReadonlyArray<{ key: string; name: string; isSystem: boolean }> = [
  { key: 'TEACHER_SALARY', name: 'O‘qituvchi maoshi', isSystem: true },
  { key: 'RENT', name: 'Ijara', isSystem: false },
  { key: 'ADVERTISEMENT', name: 'Reklama', isSystem: false },
  { key: 'UTILITIES', name: 'Kommunal xizmatlar', isSystem: false },
  { key: 'INTERNET', name: 'Internet', isSystem: false },
  { key: 'EQUIPMENT', name: 'Jihozlar', isSystem: false },
  { key: 'OFFICE', name: 'Ofis xarajatlari', isSystem: false },
  { key: 'TAX', name: 'Soliq', isSystem: false },
  { key: 'REPAIR', name: 'Ta’mirlash', isSystem: false },
  { key: 'CLEANING', name: 'Tozalash', isSystem: false },
  { key: 'OTHER_EXPENSE', name: 'Boshqa xarajat', isSystem: false },
];

const SALARY_MODELS: ReadonlyArray<{
  type: SalaryType;
  baseSalary: number;
  perLessonRate: number;
  perStudentRate: number;
  percentage: number;
  bonus: number;
}> = [
  { type: 'PER_STUDENT', baseSalary: 0, perLessonRate: 0, perStudentRate: 250_000, percentage: 0, bonus: 0 },
  { type: 'PER_LESSON', baseSalary: 0, perLessonRate: 120_000, perStudentRate: 0, percentage: 0, bonus: 0 },
  { type: 'PERCENTAGE', baseSalary: 0, perLessonRate: 0, perStudentRate: 0, percentage: 35, bonus: 0 },
  { type: 'MIXED', baseSalary: 2_000_000, perLessonRate: 0, perStudentRate: 100_000, percentage: 0, bonus: 300_000 },
  { type: 'FIXED', baseSalary: 5_000_000, perLessonRate: 0, perStudentRate: 0, percentage: 0, bonus: 0 },
];

const PARENT_FIRST_NAMES = ['Dilshod', 'Nodira', 'Anvar', 'Gulnora', 'Rustam', 'Zulfiya', 'Bahodir', 'Nargiza'] as const;
const PARENT_LAST_NAMES = ['Karimov', 'Tursunova', 'Rahimov', 'Yusupova', 'Aliyev', 'Qodirova'] as const;

const HOMEWORK_TITLES = [
  'Amaliy mashq: takrorlash',
  'Mustaqil ish: kichik loyiha',
  'Dars konspektini tayyorlash',
  'Test topshiriqlari',
] as const;

const EXPENSE_PLAN: ReadonlyArray<{ category: string; amount: number; description: string; dayOfMonth: number }> = [
  { category: 'RENT', amount: 8_000_000, description: 'Oylik ijara to‘lovi', dayOfMonth: 3 },
  { category: 'UTILITIES', amount: 1_200_000, description: 'Svet va suv', dayOfMonth: 5 },
  { category: 'INTERNET', amount: 450_000, description: 'Internet aloqasi', dayOfMonth: 5 },
  { category: 'ADVERTISEMENT', amount: 3_500_000, description: 'Instagram target reklama', dayOfMonth: 8 },
  { category: 'CLEANING', amount: 900_000, description: 'Tozalash xizmati', dayOfMonth: 10 },
  { category: 'OFFICE', amount: 700_000, description: 'Kanselyariya va ofis buyumlari', dayOfMonth: 12 },
  { category: 'EQUIPMENT', amount: 2_400_000, description: 'Proyektor va kabellar', dayOfMonth: 15 },
  { category: 'TAX', amount: 1_800_000, description: 'Soliq to‘lovi', dayOfMonth: 20 },
];

// ---------------------------------------------------------------------
// Yordamchilar
// ---------------------------------------------------------------------

/** Bir xil natija berish uchun oddiy determinated tasodif */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648;
    return value / 2_147_483_648;
  };
}

function levelForXp(totalXp: number): number {
  let level = 1;
  for (const item of LEVELS) {
    if (totalXp >= item.minXp) level = item.number;
  }
  return level;
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

// ---------------------------------------------------------------------
// Ma'lumotnomalar seedi
// ---------------------------------------------------------------------

async function seedReferenceData(prisma: PrismaClient, log: Log): Promise<void> {
  for (const level of LEVELS) {
    await prisma.level.upsert({
      where: { number: level.number },
      update: { name: level.name, minXp: level.minXp, icon: level.icon },
      create: level,
    });
  }
  log(`✔ ${LEVELS.length} ta daraja`);

  for (const [index, rule] of XP_RULES.entries()) {
    await prisma.xpRule.upsert({
      where: { key: rule.key },
      update: { name: rule.name, description: rule.description, source: rule.source, points: rule.points },
      create: { ...rule, sortOrder: index + 1 },
    });
  }
  log(`✔ ${XP_RULES.length} ta XP qoidasi`);

  for (const [index, badge] of BADGES.entries()) {
    await prisma.badge.upsert({
      where: { key: badge.key },
      update: {
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        rule: badge.rule,
        threshold: badge.threshold,
        xpReward: badge.xpReward,
      },
      create: { ...badge, sortOrder: index + 1 },
    });
  }
  log(`✔ ${BADGES.length} ta nishon (badge)`);

  for (const account of ACCOUNTS) {
    await prisma.financialAccount.upsert({
      where: { key: account.key },
      update: { name: account.name, type: account.type, sortOrder: account.sortOrder },
      create: account,
    });
  }
  log(`✔ ${ACCOUNTS.length} ta moliyaviy hisob`);

  for (const [index, category] of INCOME_CATEGORIES.entries()) {
    await prisma.incomeCategory.upsert({
      where: { key: category.key },
      update: { name: category.name, isSystem: category.isSystem },
      create: { ...category, sortOrder: index + 1 },
    });
  }
  for (const [index, category] of EXPENSE_CATEGORIES.entries()) {
    await prisma.expenseCategory.upsert({
      where: { key: category.key },
      update: { name: category.name, isSystem: category.isSystem },
      create: { ...category, sortOrder: index + 1 },
    });
  }
  log(`✔ ${INCOME_CATEGORIES.length} ta tushum va ${EXPENSE_CATEGORIES.length} ta xarajat kategoriyasi`);
}

// ---------------------------------------------------------------------
// O‘qituvchi profillari va maosh qoidalari
// ---------------------------------------------------------------------

async function seedTeachers(prisma: PrismaClient, log: Log): Promise<void> {
  const teachers = await prisma.user.findMany({
    where: { deletedAt: null, role: { key: 'TEACHER' } },
    select: { id: true, firstName: true, lastName: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (teachers.length === 0) return;

  const specializations = ['Frontend dasturlash', 'Backend dasturlash', 'Ingliz tili', 'Grafik dizayn', 'Matematika'];

  for (const [index, teacher] of teachers.entries()) {
    const profile = await prisma.teacherProfile.upsert({
      where: { userId: teacher.id },
      update: {},
      create: {
        userId: teacher.id,
        specialization: specializations[index % specializations.length] ?? null,
        experienceYears: 2 + (index % 6),
        hireDate: dateOnly(new Date(Date.now() - (300 + index * 40) * DAY)),
        bio: `${teacher.firstName} ${teacher.lastName} — o‘quv markazning tajribali o‘qituvchisi.`,
      },
      select: { id: true },
    });

    const existingRule = await prisma.teacherSalaryRule.count({ where: { teacherProfileId: profile.id } });
    if (existingRule === 0) {
      const model = SALARY_MODELS[index % SALARY_MODELS.length]!;
      await prisma.teacherSalaryRule.create({
        data: {
          teacherProfileId: profile.id,
          type: model.type,
          baseSalary: model.baseSalary,
          perLessonRate: model.perLessonRate,
          perStudentRate: model.perStudentRate,
          percentage: model.percentage,
          bonus: model.bonus,
          effectiveFrom: dateOnly(new Date(Date.now() - 180 * DAY)),
          note: 'Seed orqali yaratilgan boshlang‘ich maosh modeli',
        },
      });
    }
  }
  log(`✔ ${teachers.length} ta o‘qituvchi profili va maosh modeli`);
}

// ---------------------------------------------------------------------
// Davomat seanslari (mavjud davomat yozuvlaridan)
// ---------------------------------------------------------------------

async function seedAttendanceSessions(prisma: PrismaClient, log: Log): Promise<void> {
  const existing = await prisma.attendanceSession.count();
  if (existing > 0) return;

  const groups = await prisma.attendance.groupBy({ by: ['groupId', 'date'], _count: { _all: true } });
  if (groups.length === 0) return;

  const teacherByGroup = new Map(
    (await prisma.group.findMany({ select: { id: true, teacherId: true } })).map((group) => [group.id, group.teacherId]),
  );

  for (const row of groups) {
    const session = await prisma.attendanceSession.create({
      data: {
        groupId: row.groupId,
        teacherId: teacherByGroup.get(row.groupId) ?? null,
        date: row.date,
        status: 'HELD',
        topic: 'Amaliy mashg‘ulot',
      },
      select: { id: true },
    });
    await prisma.attendance.updateMany({
      where: { groupId: row.groupId, date: row.date },
      data: { sessionId: session.id },
    });
  }
  log(`✔ ${groups.length} ta dars seansi (mavjud davomatga bog‘landi)`);
}

// ---------------------------------------------------------------------
// Gamification: XP, daraja, streak, nishonlar
// ---------------------------------------------------------------------

async function seedGamification(prisma: PrismaClient, log: Log): Promise<void> {
  const existing = await prisma.gamificationProfile.count();
  if (existing > 0) return;

  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      number: true,
      attendances: { select: { id: true, status: true, date: true }, orderBy: { date: 'asc' } },
    },
  });
  if (students.length === 0) return;

  const badgeByKey = new Map((await prisma.badge.findMany({ select: { id: true, key: true } })).map((b) => [b.key, b.id]));
  let xpRows = 0;
  let badgeRows = 0;

  for (const student of students) {
    const random = seededRandom(student.number * 7919);
    let totalXp = 0;

    for (const attendance of student.attendances) {
      if (attendance.status === 'ABSENT') continue;
      const points = attendance.status === 'LATE' ? 5 : 10;
      totalXp += points;
      await prisma.xpTransaction.create({
        data: {
          studentId: student.id,
          points,
          source: 'ATTENDANCE',
          ruleKey: attendance.status === 'LATE' ? 'ATTENDANCE_LATE' : 'ATTENDANCE_PRESENT',
          description: attendance.status === 'LATE' ? 'Kechikib keldi' : 'Darsga keldi',
          entityType: 'attendance',
          entityId: attendance.id,
          dedupeKey: `attendance:${attendance.id}`,
          createdAt: attendance.date,
        },
      });
      xpRows += 1;
    }

    // Boshlang‘ich bonus XP — reyting real ko‘rinishi uchun
    const bonus = Math.round(random() * 400);
    if (bonus > 0) {
      totalXp += bonus;
      await prisma.xpTransaction.create({
        data: {
          studentId: student.id,
          points: bonus,
          source: 'MANUAL',
          description: 'Oldingi davr faolligi uchun',
          dedupeKey: `seed-bonus:${student.id}`,
        },
      });
      xpRows += 1;
    }

    const presentDates = student.attendances.filter((a) => a.status !== 'ABSENT').map((a) => a.date);
    const lastDate = presentDates.at(-1) ?? null;
    const current = Math.min(presentDates.length, 1 + Math.floor(random() * 12));

    await prisma.gamificationProfile.create({
      data: { studentId: student.id, totalXp, levelNumber: levelForXp(totalXp), lastXpAt: lastDate },
    });
    await prisma.streak.create({
      data: {
        studentId: student.id,
        current,
        longest: Math.max(current, Math.floor(random() * 20)),
        lastAttendanceDate: lastDate,
      },
    });

    if (current >= 7 && badgeByKey.has('STREAK_7')) {
      await prisma.studentBadge.create({
        data: { studentId: student.id, badgeId: badgeByKey.get('STREAK_7')!, note: '7 dars ketma-ket' },
      });
      badgeRows += 1;
    }
    if (totalXp >= 1000 && badgeByKey.has('FAST_LEARNER')) {
      await prisma.studentBadge.create({
        data: { studentId: student.id, badgeId: badgeByKey.get('FAST_LEARNER')!, note: '1000 XP' },
      });
      badgeRows += 1;
    }
  }

  log(`✔ ${students.length} ta gamification profili, ${xpRows} ta XP yozuvi, ${badgeRows} ta nishon`);
}

// ---------------------------------------------------------------------
// Ota-onalar
// ---------------------------------------------------------------------

async function seedParents(prisma: PrismaClient, log: Log): Promise<void> {
  const existing = await prisma.parent.count();
  if (existing > 0) return;

  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    select: { id: true, number: true, lastName: true, parentPhone: true },
    take: 40,
  });
  if (students.length === 0) return;

  let created = 0;
  for (const student of students) {
    const random = seededRandom(student.number * 104_729);
    if (random() > 0.6) continue;

    const firstName = PARENT_FIRST_NAMES[Math.floor(random() * PARENT_FIRST_NAMES.length)] ?? 'Dilshod';
    const phone = student.parentPhone ?? `+99890${String(2_000_000 + student.number).slice(0, 7)}`;
    const parent = await prisma.parent.create({
      data: {
        firstName,
        lastName: student.lastName || (PARENT_LAST_NAMES[Math.floor(random() * PARENT_LAST_NAMES.length)] ?? 'Karimov'),
        phone,
      },
      select: { id: true },
    });
    // Asosiy vakil telefoni o'quvchida ham bo'lishi kerak (qarzdorlik, qidiruv shu maydondan foydalanadi)
    if (!student.parentPhone) {
      await prisma.student.update({ where: { id: student.id }, data: { parentPhone: phone } });
    }
    await prisma.studentParent.create({
      data: {
        studentId: student.id,
        parentId: parent.id,
        relation: random() > 0.5 ? 'MOTHER' : 'FATHER',
        isPrimary: true,
      },
    });
    created += 1;
  }
  log(`✔ ${created} ta ota-ona profili`);
}

// ---------------------------------------------------------------------
// Uy vazifasi va imtihonlar
// ---------------------------------------------------------------------

async function seedHomeworkAndExams(prisma: PrismaClient, log: Log): Promise<void> {
  const existing = await prisma.homework.count();
  if (existing > 0) return;

  const groups = await prisma.group.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      courseId: true,
      teacherId: true,
      students: { where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true, number: true } },
    },
  });
  if (groups.length === 0) return;

  let homeworkCount = 0;
  let submissionCount = 0;
  let examCount = 0;
  let resultCount = 0;

  for (const [groupIndex, group] of groups.entries()) {
    if (group.students.length === 0) continue;
    const random = seededRandom((groupIndex + 1) * 31_337);

    for (let index = 0; index < 3; index += 1) {
      const deadline = new Date(Date.now() - (index * 7 - 3) * DAY);
      const homework = await prisma.homework.create({
        data: {
          title: HOMEWORK_TITLES[index % HOMEWORK_TITLES.length] ?? 'Uy vazifasi',
          description: 'Darsda o‘tilgan mavzu bo‘yicha amaliy topshiriq.',
          courseId: group.courseId,
          groupId: group.id,
          teacherId: group.teacherId,
          assignedAt: new Date(deadline.getTime() - 7 * DAY),
          deadline,
          maxPoints: 100,
          status: deadline < new Date() ? 'CLOSED' : 'PUBLISHED',
        },
        select: { id: true },
      });
      homeworkCount += 1;

      for (const student of group.students) {
        const roll = random();
        const status: SubmissionStatus = roll > 0.85 ? 'MISSED' : roll > 0.7 ? 'LATE' : 'GRADED';
        const score = status === 'MISSED' ? null : 60 + Math.floor(random() * 41);
        await prisma.homeworkSubmission.create({
          data: {
            homeworkId: homework.id,
            studentId: student.id,
            status,
            submittedAt: status === 'MISSED' ? null : new Date(deadline.getTime() - (status === 'LATE' ? -DAY : DAY)),
            score,
            gradedById: status === 'GRADED' ? group.teacherId : null,
            gradedAt: status === 'GRADED' ? deadline : null,
            xpAwarded: status === 'MISSED' ? 0 : 20,
          },
        });
        submissionCount += 1;
      }
    }

    const examDate = dateOnly(new Date(Date.now() - 10 * DAY));
    const exam = await prisma.exam.create({
      data: {
        title: 'Oraliq imtihon',
        courseId: group.courseId,
        groupId: group.id,
        teacherId: group.teacherId,
        date: examDate,
        maxScore: 100,
        passScore: 60,
        status: 'GRADED',
      },
      select: { id: true },
    });
    examCount += 1;

    for (const student of group.students) {
      const score = 45 + Math.floor(random() * 56);
      await prisma.examResult.create({
        data: {
          examId: exam.id,
          studentId: student.id,
          score,
          percentage: score,
          grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
          gradedById: group.teacherId,
          gradedAt: examDate,
          xpAwarded: score >= 90 ? 50 : score >= 75 ? 30 : 0,
        },
      });
      resultCount += 1;
    }
  }

  log(`✔ ${homeworkCount} ta uy vazifasi (${submissionCount} topshiriq), ${examCount} ta imtihon (${resultCount} natija)`);
}

// ---------------------------------------------------------------------
// Moliya: tranzaksiyalar, tushum, xarajat, budjet
// ---------------------------------------------------------------------

async function seedFinance(prisma: PrismaClient, log: Log, adminId: string | null): Promise<void> {
  const existing = await prisma.transaction.count();
  if (existing > 0) return;

  const accounts = await prisma.financialAccount.findMany({ select: { id: true, key: true } });
  const accountByKey = new Map(accounts.map((account) => [account.key, account.id]));
  const accountIdFor = (method: PaymentMethod): string | null => accountByKey.get(method) ?? accountByKey.get('CASH') ?? null;

  // 1) Mavjud to‘lovlar uchun daftar yozuvlari
  const payments = await prisma.payment.findMany({
    where: { deletedAt: null, transactionId: null },
    select: { id: true, amount: true, method: true, paidAt: true, student: { select: { firstName: true, lastName: true } } },
  });
  for (const payment of payments) {
    const transaction = await prisma.transaction.create({
      data: {
        type: 'INCOME',
        amount: payment.amount,
        accountId: accountIdFor(payment.method),
        occurredAt: payment.paidAt,
        description: `O‘quv to‘lovi — ${payment.student.firstName} ${payment.student.lastName}`,
        categoryName: 'O‘quvchi to‘lovi',
        entityType: 'payment',
        entityId: payment.id,
        createdById: adminId,
      },
      select: { id: true },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { transactionId: transaction.id } });
  }

  // 2) Qo‘shimcha tushumlar
  const incomeCategories = await prisma.incomeCategory.findMany({ select: { id: true, key: true, name: true } });
  const categoryByKey = new Map(incomeCategories.map((c) => [c.key, c] as const));
  const extraIncomes: ReadonlyArray<{ key: string; amount: number; description: string; daysAgo: number }> = [
    { key: 'REGISTRATION', amount: 300_000, description: 'Ro‘yxatga olish to‘lovi', daysAgo: 4 },
    { key: 'BOOKS', amount: 450_000, description: 'Darslik sotildi', daysAgo: 9 },
    { key: 'UNIFORM', amount: 250_000, description: 'Forma sotildi', daysAgo: 14 },
    { key: 'REGISTRATION', amount: 300_000, description: 'Ro‘yxatga olish to‘lovi', daysAgo: 21 },
    { key: 'OTHER_INCOME', amount: 700_000, description: 'Zal ijarasi', daysAgo: 28 },
    { key: 'BOOKS', amount: 380_000, description: 'Qo‘llanma sotildi', daysAgo: 35 },
  ];

  let incomeCount = 0;
  for (const item of extraIncomes) {
    const category = categoryByKey.get(item.key);
    if (!category) continue;
    const occurredAt = new Date(Date.now() - item.daysAgo * DAY);
    const transaction = await prisma.transaction.create({
      data: {
        type: 'INCOME',
        amount: item.amount,
        accountId: accountByKey.get('CASH') ?? null,
        occurredAt,
        description: item.description,
        categoryName: category.name,
        entityType: 'income',
        createdById: adminId,
      },
      select: { id: true },
    });
    const income = await prisma.income.create({
      data: {
        categoryId: category.id,
        amount: item.amount,
        method: 'CASH',
        accountId: accountByKey.get('CASH') ?? null,
        receivedAt: occurredAt,
        description: item.description,
        responsibleId: adminId,
        transactionId: transaction.id,
      },
      select: { id: true },
    });
    await prisma.transaction.update({ where: { id: transaction.id }, data: { entityId: income.id } });
    incomeCount += 1;
  }

  // 3) Xarajatlar — oxirgi 3 oy
  const expenseCategories = await prisma.expenseCategory.findMany({ select: { id: true, key: true, name: true } });
  const expenseByKey = new Map(expenseCategories.map((c) => [c.key, c] as const));
  const now = new Date();
  let expenseCount = 0;

  for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo -= 1) {
    for (const plan of EXPENSE_PLAN) {
      const category = expenseByKey.get(plan.category);
      if (!category) continue;
      const spentAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, plan.dayOfMonth, 10));
      if (spentAt > now) continue;

      const method: PaymentMethod = plan.category === 'TAX' || plan.category === 'RENT' ? 'BANK' : 'CASH';
      const transaction = await prisma.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: plan.amount,
          accountId: accountIdFor(method),
          occurredAt: spentAt,
          description: plan.description,
          categoryName: category.name,
          entityType: 'expense',
          createdById: adminId,
        },
        select: { id: true },
      });
      const expense = await prisma.expense.create({
        data: {
          categoryId: category.id,
          amount: plan.amount,
          method,
          accountId: accountIdFor(method),
          spentAt,
          description: plan.description,
          responsibleId: adminId,
          transactionId: transaction.id,
        },
        select: { id: true },
      });
      await prisma.transaction.update({ where: { id: transaction.id }, data: { entityId: expense.id } });
      expenseCount += 1;
    }
  }

  // 4) Boshlang‘ich kassa qoldig‘i — xarajatlar hisobidan minusga tushmasligi uchun
  const openingBalances: ReadonlyArray<{ key: string; amount: number }> = [
    { key: 'CASH', amount: 20_000_000 },
    { key: 'BANK', amount: 60_000_000 },
  ];
  for (const opening of openingBalances) {
    const accountId = accountByKey.get(opening.key);
    if (!accountId) continue;
    await prisma.transaction.create({
      data: {
        type: 'INCOME',
        amount: opening.amount,
        accountId,
        occurredAt: new Date(Date.now() - 95 * DAY),
        description: 'Boshlang‘ich qoldiq',
        categoryName: 'Boshlang‘ich qoldiq',
        entityType: 'opening-balance',
        createdById: adminId,
      },
    });
  }

  // 5) Hisoblar qoldig‘ini yangilash
  for (const account of accounts) {
    const income = await prisma.transaction.aggregate({
      where: { accountId: account.id, status: 'COMPLETED', type: 'INCOME' },
      _sum: { amount: true },
    });
    const expense = await prisma.transaction.aggregate({
      where: { accountId: account.id, status: 'COMPLETED', type: 'EXPENSE' },
      _sum: { amount: true },
    });
    const balance = (income._sum.amount?.toNumber() ?? 0) - (expense._sum.amount?.toNumber() ?? 0);
    await prisma.financialAccount.update({ where: { id: account.id }, data: { balance } });
  }

  // 6) Joriy oy budjeti
  const budget = await prisma.budget.upsert({
    where: { year_month: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 } },
    update: {},
    create: {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      note: 'Joriy oy uchun rejalashtirilgan xarajatlar',
      createdById: adminId,
    },
    select: { id: true },
  });
  const budgetPlan: ReadonlyArray<{ key: string; amount: number }> = [
    { key: 'RENT', amount: 8_000_000 },
    { key: 'ADVERTISEMENT', amount: 5_000_000 },
    { key: 'TEACHER_SALARY', amount: 25_000_000 },
    { key: 'UTILITIES', amount: 1_500_000 },
    { key: 'OFFICE', amount: 1_000_000 },
    { key: 'EQUIPMENT', amount: 3_000_000 },
  ];
  for (const line of budgetPlan) {
    const category = expenseByKey.get(line.key);
    if (!category) continue;
    await prisma.budgetLine.upsert({
      where: { budgetId_categoryId: { budgetId: budget.id, categoryId: category.id } },
      update: { plannedAmount: line.amount },
      create: { budgetId: budget.id, categoryId: category.id, plannedAmount: line.amount },
    });
  }

  log(`✔ ${payments.length} ta to‘lov daftarga bog‘landi, ${incomeCount} ta tushum, ${expenseCount} ta xarajat, budjet`);
}

// ---------------------------------------------------------------------
// Sotuv rejalari
// ---------------------------------------------------------------------

async function seedSalesTargets(prisma: PrismaClient, log: Log, adminId: string | null): Promise<void> {
  const existing = await prisma.salesTarget.count();
  if (existing > 0) return;

  const managers = await prisma.user.findMany({
    where: { deletedAt: null, role: { key: 'SALES_MANAGER' } },
    select: { id: true },
  });
  if (managers.length === 0) return;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  let created = 0;

  for (const manager of managers) {
    for (const [type, value] of [
      ['LEADS', 60],
      ['SALES', 15],
      ['REVENUE', 45_000_000],
    ] as const) {
      await prisma.salesTarget.create({
        data: { userId: manager.id, year, month, type, targetValue: value, createdById: adminId },
      });
      created += 1;
    }
  }
  log(`✔ ${created} ta sotuv rejasi (${managers.length} manager)`);
}

// ---------------------------------------------------------------------
// Asosiy funksiya
// ---------------------------------------------------------------------

export async function seedAcademyModules(prisma: PrismaClient, log: Log): Promise<void> {
  log('\nO‘quv markaz modullari:');
  await seedReferenceData(prisma, log);
  await seedTeachers(prisma, log);

  const admin = await prisma.user.findFirst({
    where: { deletedAt: null, role: { key: { in: ['SUPER_ADMIN', 'OWNER', 'ADMIN'] } } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  await seedAttendanceSessions(prisma, log);
  await seedGamification(prisma, log);
  await seedParents(prisma, log);
  await seedHomeworkAndExams(prisma, log);
  await seedFinance(prisma, log, admin?.id ?? null);
  await seedSalesTargets(prisma, log, admin?.id ?? null);
}
