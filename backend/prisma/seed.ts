/**
 * Development seed.
 *
 *   npx prisma db seed          (yoki: npm run db:seed)
 *
 * - Permission, rol, xodimlar, manbalar, kurslar, guruhlar va sozlamalar — har safar idempotent (upsert).
 * - Demo ma'lumotlar (40 lead, qo‘ng‘iroqlar, follow-up, o‘quvchilar, to‘lovlar, davomat) — faqat baza bo‘sh bo‘lsa.
 * - Mavjud rollarning permissionlari Super Admin o‘zgartirgan bo‘lishi mumkin, shuning uchun ular faqat
 *   SEED_RESET_PERMISSIONS=true bo‘lsa qayta yoziladi.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';
import { ROLE_KEYS } from '../src/config/permissions.js';
import type { RoleKey } from '../src/config/permissions.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  AttendanceStatus,
  CallResult,
  CourseCategory,
  Gender,
  GroupStatus,
  LeadPriority,
  LeadStatus,
  PaymentMethod,
  StudentStatus,
  UserStatus,
  WeekDay,
} from '../src/generated/prisma/client.js';

import { seedAcademyModules } from './academySeed.js';
import { LEAD_SOURCES, seedLeadSources, seedRolesAndPermissions } from './coreSeed.js';
import { backfillPaymentSchedules } from './paymentScheduleBackfill.js';
import { backfillGroupHistory } from './studentGroupHistoryBackfill.js';

config({ quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL topilmadi. backend/.env faylini tekshiring.\n');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

// ---------------------------------------------------------------------
// Yordamchi funksiyalar
// ---------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date();
const BCRYPT_ROUNDS = 12;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

/** Deterministik tasodifiy sonlar (mulberry32) — seed har safar bir xil natija beradi. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = createRandom(20_260_911);

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function chance(probability: number): boolean {
  return random() < probability;
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick(): ro‘yxat bo‘sh');
  return item;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error('at(): ro‘yxat bo‘sh');
  return item;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR);
}

function earliest(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function latest(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function startOfToday(): Date {
  const date = new Date(NOW);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** @db.Date ustunlari uchun: lokal sanani UTC yarim tunda qaytaradi. */
function dateOnly(offsetDays: number, base: Date = NOW): Date {
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

const WEEKDAY_BY_UTC_DAY: readonly WeekDay[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

// ---------------------------------------------------------------------
// Ma'lumotnoma ro‘yxatlari
// ---------------------------------------------------------------------

interface SeedUserDefinition {
  key: 'admin' | 'owner' | 'manager' | 'manager2' | 'callCenter' | 'teacher' | 'teacher2' | 'accountant' | 'pending';
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: RoleKey;
  status: UserStatus;
}

const SEED_USERS: readonly SeedUserDefinition[] = [
  { key: 'admin', email: 'admin@example.com', password: 'Admin123!', firstName: 'Jamshid', lastName: 'Karimov', phone: '+998901000001', role: ROLE_KEYS.SUPER_ADMIN, status: 'ACTIVE' },
  { key: 'owner', email: 'owner@example.com', password: 'Owner123!', firstName: 'Sherzod', lastName: 'Abdullayev', phone: '+998901000009', role: ROLE_KEYS.OWNER, status: 'ACTIVE' },
  { key: 'manager', email: 'manager@example.com', password: 'Manager123!', firstName: 'Dilshod', lastName: 'Rahimov', phone: '+998901000002', role: ROLE_KEYS.SALES_MANAGER, status: 'ACTIVE' },
  { key: 'manager2', email: 'manager2@example.com', password: 'Manager123!', firstName: 'Malika', lastName: 'Tursunova', phone: '+998901000003', role: ROLE_KEYS.SALES_MANAGER, status: 'ACTIVE' },
  { key: 'callCenter', email: 'callcenter@example.com', password: 'Callcenter123!', firstName: 'Nodira', lastName: 'Yusupova', phone: '+998901000004', role: ROLE_KEYS.CALL_CENTER, status: 'ACTIVE' },
  { key: 'teacher', email: 'teacher@example.com', password: 'Teacher123!', firstName: 'Bobur', lastName: 'Ismoilov', phone: '+998901000005', role: ROLE_KEYS.TEACHER, status: 'ACTIVE' },
  { key: 'teacher2', email: 'teacher2@example.com', password: 'Teacher123!', firstName: 'Zilola', lastName: 'Nazarova', phone: '+998901000006', role: ROLE_KEYS.TEACHER, status: 'ACTIVE' },
  { key: 'accountant', email: 'accountant@example.com', password: 'Accountant123!', firstName: 'Gulnora', lastName: 'Saidova', phone: '+998901000007', role: ROLE_KEYS.ACCOUNTANT, status: 'ACTIVE' },
  { key: 'pending', email: 'pending@example.com', password: 'Pending123!', firstName: 'Sanjar', lastName: 'Ergashev', phone: '+998901000008', role: ROLE_KEYS.CALL_CENTER, status: 'PENDING' },
];

const SOURCES = LEAD_SOURCES;

/** Leadlar qaysi manbadan ko‘proq kelishini aks ettiradi. */
const SOURCE_WEIGHTS: readonly string[] = [
  'INSTAGRAM', 'INSTAGRAM', 'INSTAGRAM', 'INSTAGRAM', 'TELEGRAM', 'TELEGRAM', 'TELEGRAM',
  'RECOMMENDATION', 'RECOMMENDATION', 'WEBSITE', 'GOOGLE', 'YOUTUBE', 'FACEBOOK', 'WALK_IN',
  'PHONE', 'ADVERTISEMENT', 'OTHER',
];

interface CourseDefinition {
  name: string;
  category: CourseCategory;
  description: string;
  durationMonths: number;
  price: number;
  discountAmount: number;
  teacherKey: 'teacher' | 'teacher2';
}

const COURSES: readonly CourseDefinition[] = [
  { name: 'Frontend', category: 'PROGRAMMING', description: 'HTML, CSS, JavaScript, React va TypeScript. Real loyihalar bilan portfolio.', durationMonths: 6, price: 7_200_000, discountAmount: 0, teacherKey: 'teacher' },
  { name: 'Backend', category: 'PROGRAMMING', description: 'Node.js, Express, PostgreSQL, REST API va deploy.', durationMonths: 7, price: 8_400_000, discountAmount: 400_000, teacherKey: 'teacher' },
  { name: 'English', category: 'LANGUAGE', description: 'Beginner’dan IELTS darajasigacha umumiy ingliz tili.', durationMonths: 6, price: 4_800_000, discountAmount: 0, teacherKey: 'teacher2' },
  { name: 'German', category: 'LANGUAGE', description: 'A1–B1 darajalar, Goethe imtihoniga tayyorlov.', durationMonths: 5, price: 4_500_000, discountAmount: 250_000, teacherKey: 'teacher2' },
  { name: 'Korean', category: 'LANGUAGE', description: 'TOPIK I–II ga tayyorlov, so‘zlashuv amaliyoti.', durationMonths: 5, price: 4_500_000, discountAmount: 0, teacherKey: 'teacher2' },
  { name: 'Computer Literacy', category: 'COMPUTER_LITERACY', description: 'Kompyuter savodxonligi: Windows, Word, Excel, internet.', durationMonths: 2, price: 1_500_000, discountAmount: 0, teacherKey: 'teacher' },
  { name: 'President School Preparation', category: 'SCHOOL_PREPARATION', description: 'Prezident maktablariga kirish imtihoniga tayyorlov: matematika, ingliz tili, mantiq.', durationMonths: 8, price: 6_400_000, discountAmount: 0, teacherKey: 'teacher2' },
];

interface GroupDefinition {
  name: string;
  courseName: string;
  teacherKey: 'teacher' | 'teacher2';
  room: string;
  startOffsetDays: number;
  scheduleDays: readonly WeekDay[];
  startTime: string;
  endTime: string;
  capacity: number;
  status: GroupStatus;
}

const ODD_DAYS: readonly WeekDay[] = ['MONDAY', 'WEDNESDAY', 'FRIDAY'];
const EVEN_DAYS: readonly WeekDay[] = ['TUESDAY', 'THURSDAY', 'SATURDAY'];

const GROUPS: readonly GroupDefinition[] = [
  { name: 'FE-01', courseName: 'Frontend', teacherKey: 'teacher', room: '101', startOffsetDays: -60, scheduleDays: ODD_DAYS, startTime: '14:00', endTime: '16:00', capacity: 16, status: 'ACTIVE' },
  { name: 'FE-02', courseName: 'Frontend', teacherKey: 'teacher', room: '101', startOffsetDays: 10, scheduleDays: EVEN_DAYS, startTime: '16:00', endTime: '18:00', capacity: 16, status: 'PLANNED' },
  { name: 'BE-01', courseName: 'Backend', teacherKey: 'teacher', room: '102', startOffsetDays: -45, scheduleDays: EVEN_DAYS, startTime: '18:00', endTime: '20:00', capacity: 14, status: 'ACTIVE' },
  { name: 'EN-01', courseName: 'English', teacherKey: 'teacher2', room: '201', startOffsetDays: -75, scheduleDays: ODD_DAYS, startTime: '09:00', endTime: '10:30', capacity: 12, status: 'ACTIVE' },
  { name: 'EN-02', courseName: 'English', teacherKey: 'teacher2', room: '201', startOffsetDays: -30, scheduleDays: EVEN_DAYS, startTime: '15:00', endTime: '16:30', capacity: 12, status: 'ACTIVE' },
  { name: 'DE-01', courseName: 'German', teacherKey: 'teacher2', room: '202', startOffsetDays: -40, scheduleDays: ODD_DAYS, startTime: '17:00', endTime: '18:30', capacity: 12, status: 'ACTIVE' },
  { name: 'KR-01', courseName: 'Korean', teacherKey: 'teacher2', room: '203', startOffsetDays: 14, scheduleDays: EVEN_DAYS, startTime: '10:00', endTime: '11:30', capacity: 12, status: 'PLANNED' },
  { name: 'CL-01', courseName: 'Computer Literacy', teacherKey: 'teacher', room: '103', startOffsetDays: -20, scheduleDays: ODD_DAYS, startTime: '10:00', endTime: '11:30', capacity: 10, status: 'ACTIVE' },
  { name: 'PS-01', courseName: 'President School Preparation', teacherKey: 'teacher2', room: '204', startOffsetDays: -50, scheduleDays: EVEN_DAYS, startTime: '13:00', endTime: '15:00', capacity: 15, status: 'ACTIVE' },
];

const MALE_FIRST_NAMES = ['Aziz', 'Bekzod', 'Jasur', 'Sardor', 'Otabek', 'Jahongir', 'Sherzod', 'Diyorbek', 'Islom', 'Temur', 'Abdulloh', 'Muhammadali', 'Behruz', 'Javohir', 'Ulug‘bek', 'Asadbek', 'Shohruh', 'Doston'] as const;
const FEMALE_FIRST_NAMES = ['Madina', 'Dilnoza', 'Sevara', 'Malika', 'Nilufar', 'Shahzoda', 'Zarina', 'Mohinur', 'Gulnoza', 'Kamola', 'Nigora', 'Munisa', 'Charos', 'Feruza', 'Sabina', 'Mubina'] as const;
const LAST_NAMES = ['Karimov', 'Tursunov', 'Rahimov', 'Yusupov', 'Aliyev', 'Qodirov', 'Ismoilov', 'Nazarov', 'Saidov', 'Ergashev', 'Xolmatov', 'Mirzayev', 'Abdullayev', 'Sobirov', 'Hamidov', 'Usmonov', 'Jo‘rayev', 'Po‘latov'] as const;
const OPERATOR_CODES = ['90', '91', '93', '94', '95', '97', '98', '99', '33', '88'] as const;
const ADDRESSES = [
  'Andijon sh., Bobur shoh ko‘chasi',
  'Andijon sh., Navoiy shoh ko‘chasi',
  'Andijon sh., Yangi hayot MFY',
  'Asaka tumani',
  'Xo‘jaobod tumani',
  'Shahrixon tumani',
  'Oltinko‘l tumani',
  'Baliqchi tumani',
] as const;
const NOTE_TEXTS = [
  'Kechki guruhlarni so‘radi, ishdan keyin qatnashmoqchi.',
  'Ota-onasi bilan maslahatlashib javob beradi.',
  'Narx bo‘yicha chegirma so‘radi.',
  'Oldin boshqa markazda o‘qigan, darajasini tekshirish kerak.',
  'Onlayn darslar bormi deb so‘radi.',
  'Do‘sti bilan birga yozilmoqchi.',
  'Sertifikat berilishi muhim ekanini aytdi.',
  'Hafta oxiri guruhini afzal ko‘radi.',
] as const;
const LOST_REASONS = ['Narx qimmatlik qildi', 'Boshqa o‘quv markazni tanladi', 'Dars vaqti to‘g‘ri kelmadi'] as const;
const PRIORITY_WEIGHTS: readonly LeadPriority[] = ['LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'URGENT'];
const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'CASH', 'CARD', 'CLICK', 'CLICK', 'PAYME', 'PAYME', 'UZUM', 'BANK'];

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Yangi',
  CONTACTED: 'Bog‘lanildi',
  INTERESTED: 'Qiziqdi',
  TRIAL_BOOKED: 'Sinov darsiga yozildi',
  TRIAL_ATTENDED: 'Sinov darsiga keldi',
  NEGOTIATION: 'Muzokara',
  WON: 'Sotildi',
  LOST: 'Yo‘qotildi',
  CALLBACK: 'Qayta qo‘ng‘iroq',
};

const CALL_NOTES: Record<CallResult, string> = {
  ANSWERED: 'Kurs, dars jadvali va narx haqida ma’lumot berildi.',
  NO_ANSWER: 'Telefonni ko‘tarmadi.',
  BUSY: 'Band edi, keyinroq qo‘ng‘iroq qilish kerak.',
  WRONG_NUMBER: 'Raqam noto‘g‘ri.',
  INTERESTED: 'Kursga qiziqdi, sinov darsiga taklif qilindi.',
  NOT_INTERESTED: 'Hozircha qiziqmayotganini aytdi.',
  CALLBACK: 'Ertaga qayta qo‘ng‘iroq qilishni so‘radi.',
};

/** Statusga o‘tishdan oldingi qo‘ng‘iroq natijasi. */
const CALL_RESULT_FOR_STATUS: Partial<Record<LeadStatus, CallResult>> = {
  CONTACTED: 'ANSWERED',
  INTERESTED: 'INTERESTED',
  CALLBACK: 'CALLBACK',
  TRIAL_BOOKED: 'INTERESTED',
  NEGOTIATION: 'ANSWERED',
  LOST: 'NOT_INTERESTED',
};

const FOLLOW_UP_TITLES: Partial<Record<LeadStatus, string>> = {
  NEW: 'Birinchi qo‘ng‘iroqni amalga oshirish',
  CONTACTED: 'Kurs haqida batafsil ma’lumot yuborish',
  INTERESTED: 'Sinov darsiga taklif qilish',
  CALLBACK: 'Qayta qo‘ng‘iroq qilish',
  TRIAL_BOOKED: 'Sinov darsini eslatish',
  TRIAL_ATTENDED: 'Sinov darsidan keyingi fikrini so‘rash',
  NEGOTIATION: 'Shartnoma va to‘lov bo‘yicha kelishish',
};

const FUNNEL: readonly LeadStatus[] = ['NEW', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'NEGOTIATION', 'WON'];

function statusPath(status: LeadStatus): LeadStatus[] {
  if (status === 'CALLBACK') return ['NEW', 'CONTACTED', 'CALLBACK'];
  if (status === 'LOST') return ['NEW', 'CONTACTED', 'INTERESTED', 'LOST'];
  return FUNNEL.slice(0, FUNNEL.indexOf(status) + 1);
}

/** Har bir status uchun lead necha kun oldin yaratilgani (min, max). */
const CREATED_DAYS_AGO: Record<LeadStatus, readonly [number, number]> = {
  NEW: [0, 3],
  CONTACTED: [1, 7],
  INTERESTED: [3, 12],
  CALLBACK: [2, 8],
  TRIAL_BOOKED: [5, 15],
  TRIAL_ATTENDED: [8, 20],
  NEGOTIATION: [10, 25],
  WON: [15, 45],
  LOST: [10, 40],
};

function repeat<T>(value: T, count: number): T[] {
  return Array.from({ length: count }, () => value);
}

/** 40 ta lead: statuslar real sotuv bo‘limidagi taqsimotga yaqin. */
const LEAD_STATUS_PLAN: readonly LeadStatus[] = [
  ...repeat<LeadStatus>('NEW', 8),
  ...repeat<LeadStatus>('CONTACTED', 6),
  ...repeat<LeadStatus>('INTERESTED', 6),
  ...repeat<LeadStatus>('CALLBACK', 2),
  ...repeat<LeadStatus>('TRIAL_BOOKED', 4),
  ...repeat<LeadStatus>('TRIAL_ATTENDED', 3),
  ...repeat<LeadStatus>('NEGOTIATION', 3),
  ...repeat<LeadStatus>('WON', 6),
  ...repeat<LeadStatus>('LOST', 2),
];

/** O‘quvchilar to‘lagan ulush (0 — hali to‘lamagan). */
const PAYMENT_FRACTIONS: readonly number[] = [1, 0.5, 0.3, 0, 0.6, 0.25, 1, 0.4, 0.75, 0.5];

// ---------------------------------------------------------------------
// Person generator
// ---------------------------------------------------------------------

interface Person {
  firstName: string;
  lastName: string;
  gender: Gender;
  phone: string;
  telegram: string | null;
  email: string | null;
}

const usedPhones = new Set<string>();

function latinHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function generatePerson(): Person {
  const gender: Gender = chance(0.5) ? 'MALE' : 'FEMALE';
  const firstName = gender === 'MALE' ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
  const baseLastName = pick(LAST_NAMES);
  const lastName = gender === 'MALE' ? baseLastName : `${baseLastName}a`;

  let phone: string;
  do {
    phone = `+998${pick(OPERATOR_CODES)}${String(randomInt(0, 9_999_999)).padStart(7, '0')}`;
  } while (usedPhones.has(phone));
  usedPhones.add(phone);

  const handle = `${latinHandle(firstName)}_${latinHandle(lastName)}${randomInt(1, 99)}`;
  return {
    firstName,
    lastName,
    gender,
    phone,
    telegram: chance(0.7) ? `@${handle}` : null,
    email: chance(0.35) ? `${handle}@gmail.com` : null,
  };
}

// ---------------------------------------------------------------------
// Asosiy ma'lumotlar (idempotent)
// ---------------------------------------------------------------------

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
}

type SeedUsers = Record<SeedUserDefinition['key'], UserRef>;

async function seedUsers(roleIdByKey: Map<RoleKey, string>): Promise<SeedUsers> {
  const result: Partial<SeedUsers> = {};

  for (const definition of SEED_USERS) {
    const roleId = roleIdByKey.get(definition.role);
    if (!roleId) throw new Error(`Rol topilmadi: ${definition.role}`);

    const user = await prisma.user.upsert({
      where: { email: definition.email },
      update: {},
      create: {
        email: definition.email,
        passwordHash: await hash(definition.password, BCRYPT_ROUNDS),
        firstName: definition.firstName,
        lastName: definition.lastName,
        phone: definition.phone,
        roleId,
        status: definition.status,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    result[definition.key] = user;
  }

  const users: SeedUsers = {
    admin: requireUser(result.admin, 'admin'),
    owner: requireUser(result.owner, 'owner'),
    manager: requireUser(result.manager, 'manager'),
    manager2: requireUser(result.manager2, 'manager2'),
    callCenter: requireUser(result.callCenter, 'callCenter'),
    teacher: requireUser(result.teacher, 'teacher'),
    teacher2: requireUser(result.teacher2, 'teacher2'),
    accountant: requireUser(result.accountant, 'accountant'),
    pending: requireUser(result.pending, 'pending'),
  };
  log(`✔ ${SEED_USERS.length} ta xodim`);
  return users;
}

function requireUser(user: UserRef | undefined, key: string): UserRef {
  if (!user) throw new Error(`Seed foydalanuvchisi yaratilmadi: ${key}`);
  return user;
}

interface CourseRef {
  id: string;
  name: string;
  finalPrice: number;
}

async function seedCourses(users: SeedUsers): Promise<CourseRef[]> {
  const courses: CourseRef[] = [];
  for (const course of COURSES) {
    const saved = await prisma.course.upsert({
      where: { name: course.name },
      update: {},
      create: {
        name: course.name,
        category: course.category,
        description: course.description,
        durationMonths: course.durationMonths,
        price: course.price,
        discountAmount: course.discountAmount,
        finalPrice: course.price - course.discountAmount,
        teacherId: users[course.teacherKey].id,
      },
    });
    courses.push({ id: saved.id, name: saved.name, finalPrice: saved.finalPrice.toNumber() });
  }
  log(`✔ ${courses.length} ta kurs`);
  return courses;
}

interface GroupRef {
  id: string;
  courseId: string;
  teacherId: string | null;
  status: GroupStatus;
  startDate: Date;
  scheduleDays: WeekDay[];
}

async function seedGroups(users: SeedUsers, courses: readonly CourseRef[]): Promise<GroupRef[]> {
  const groups: GroupRef[] = [];
  for (const group of GROUPS) {
    const course = courses.find((item) => item.name === group.courseName);
    if (!course) throw new Error(`Kurs topilmadi: ${group.courseName}`);

    const startDate = dateOnly(group.startOffsetDays);
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + (COURSES.find((item) => item.name === group.courseName)?.durationMonths ?? 6));

    const saved = await prisma.group.upsert({
      where: { name: group.name },
      update: {},
      create: {
        name: group.name,
        courseId: course.id,
        teacherId: users[group.teacherKey].id,
        room: group.room,
        startDate,
        endDate,
        scheduleDays: [...group.scheduleDays],
        startTime: group.startTime,
        endTime: group.endTime,
        capacity: group.capacity,
        status: group.status,
      },
    });
    groups.push({
      id: saved.id,
      courseId: saved.courseId,
      teacherId: saved.teacherId,
      status: saved.status,
      startDate: saved.startDate,
      scheduleDays: saved.scheduleDays,
    });
  }
  log(`✔ ${groups.length} ta guruh`);
  return groups;
}

async function seedSettings(adminId: string): Promise<void> {
  const settings: ReadonlyArray<{ key: string; value: Record<string, string | number | boolean>; description: string }> = [
    {
      key: 'company',
      value: { name: 'IT-Academy', phone: '+998 74 200 00 00', address: 'Andijon sh., Bobur shoh ko‘chasi 1', telegram: '@itacademy_uz' },
      description: 'O‘quv markaz ma’lumotlari',
    },
    { key: 'currency', value: { code: 'UZS', symbol: 'so‘m' }, description: 'Valyuta' },
    {
      key: 'followUp',
      value: { reminderMinutesBefore: 30, overdueNotify: true },
      description: 'Follow-up eslatma sozlamalari',
    },
    { key: 'workingHours', value: { start: '09:00', end: '20:00' }, description: 'Ish vaqti' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value, description: setting.description, updatedById: adminId },
    });
  }
  log(`✔ ${settings.length} ta sozlama`);
}

// ---------------------------------------------------------------------
// Demo ma'lumotlar (faqat bo‘sh bazada)
// ---------------------------------------------------------------------

interface DemoContext {
  users: SeedUsers;
  sourceIdByKey: Map<string, string>;
  courses: CourseRef[];
  groups: GroupRef[];
}

interface ActivityInput {
  type:
    | 'CREATED'
    | 'ASSIGNED'
    | 'STATUS_CHANGED'
    | 'CALL_LOGGED'
    | 'NOTE_ADDED'
    | 'FOLLOW_UP_CREATED'
    | 'FOLLOW_UP_COMPLETED';
  description: string;
  userId: string | null;
  createdAt: Date;
  metadata?: { from: LeadStatus; to: LeadStatus };
}

interface CallInput {
  managerId: string | null;
  result: CallResult;
  calledAt: Date;
  durationSec: number;
  notes: string;
  nextCallAt: Date | null;
}

interface FollowUpInput {
  assignedToId: string | null;
  createdById: string | null;
  title: string;
  dueAt: Date;
  remindAt: Date;
  status: 'PENDING' | 'DONE';
  completedAt: Date | null;
  createdAt: Date;
}

const FOLLOW_UP_BUCKETS = ['overdue', 'today', 'today', 'tomorrow', 'later'] as const;

function followUpDueAt(bucket: (typeof FOLLOW_UP_BUCKETS)[number]): Date {
  const today = startOfToday();
  switch (bucket) {
    case 'overdue':
      return addHours(NOW, -randomInt(3, 30));
    case 'today': {
      const endOfToday = addMinutes(addHours(today, 24), -1);
      return earliest(addMinutes(NOW, randomInt(60, 300)), endOfToday);
    }
    case 'tomorrow':
      return addMinutes(addHours(today, 24 + randomInt(10, 17)), pick([0, 15, 30, 45]));
    case 'later':
      return addHours(today, randomInt(2, 5) * 24 + randomInt(10, 17));
  }
}

function paymentAmounts(contractPrice: number, fraction: number): number[] {
  if (fraction <= 0) return [];
  const total = Math.min(contractPrice, roundTo(contractPrice * fraction, 50_000));
  if (fraction >= 0.5 && total > 100_000) {
    const first = roundTo(total / 2, 50_000);
    return [first, total - first];
  }
  return [total];
}

async function createStudentWithPayments(options: {
  ctx: DemoContext;
  person: Person;
  course: CourseRef;
  group: GroupRef | undefined;
  leadId: string | null;
  managerId: string | null;
  createdById: string;
  startAt: Date;
  status: StudentStatus;
  fraction: number;
  contractIndex: number;
  address: string | null;
  lastPaymentAt?: Date;
}): Promise<{ id: string; number: number }> {
  const { ctx, person, course, group, startAt, fraction } = options;
  const plannedAmounts = paymentAmounts(course.finalPrice, fraction);
  const paidAmount = plannedAmounts.reduce((sum, amount) => sum + amount, 0);
  const remainingAmount = Math.max(course.finalPrice - paidAmount, 0);

  // Oddiy to‘lovlar kechagi kundan kechiktirilmaydi — "bugungi tushum"da faqat ataylab belgilangan to‘lov chiqadi.
  const latestRegularPaymentAt = addHours(startOfToday(), -2);
  const payments: Array<{ amount: number; paidAt: Date }> = [];

  if (options.lastPaymentAt) {
    if (paidAmount > 0) payments.push({ amount: paidAmount, paidAt: options.lastPaymentAt });
  } else {
    const firstPaidAt =
      addHours(startAt, 1) <= latestRegularPaymentAt
        ? addHours(startAt, 1)
        : earliest(addMinutes(startAt, 30), addMinutes(NOW, -30));

    for (const [index, amount] of plannedAmounts.entries()) {
      if (index === 0) {
        payments.push({ amount, paidAt: firstPaidAt });
        continue;
      }
      const candidate = addHours(firstPaidAt, randomInt(7, 20) * 24);
      const windowMs = latestRegularPaymentAt.getTime() - firstPaidAt.getTime();
      const paidAt =
        candidate <= latestRegularPaymentAt
          ? candidate
          : windowMs > DAY
            ? new Date(firstPaidAt.getTime() + windowMs * (0.5 + random() * 0.5))
            : null;
      const previous = payments[payments.length - 1];
      if (paidAt) {
        payments.push({ amount, paidAt });
      } else if (previous) {
        previous.amount += amount;
      }
    }
  }

  const student = await prisma.student.create({
    data: {
      leadId: options.leadId,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      parentPhone: chance(0.5) ? `+998${pick(OPERATOR_CODES)}${String(randomInt(0, 9_999_999)).padStart(7, '0')}` : null,
      telegram: person.telegram,
      email: person.email,
      gender: person.gender,
      address: options.address,
      courseId: course.id,
      groupId: group?.id ?? null,
      contractNumber: `SH-${NOW.getFullYear()}-${String(options.contractIndex).padStart(4, '0')}`,
      contractPrice: course.finalPrice,
      startDate: dateOnly(0, startAt),
      status: options.status,
      statusChangedAt: options.status === 'ACTIVE' ? null : addHours(startAt, 24 * randomInt(5, 15)),
      createdById: options.createdById,
      createdAt: startAt,
      debt: {
        create: {
          totalAmount: course.finalPrice,
          paidAmount,
          remainingAmount,
          status: paidAmount === 0 ? 'UNPAID' : remainingAmount === 0 ? 'PAID' : 'PARTIAL',
        },
      },
      payments: {
        create: payments.map((payment, index) => ({
          courseId: course.id,
          amount: payment.amount,
          method: pick(PAYMENT_METHODS),
          paidAt: payment.paidAt,
          comment: index === 0 ? 'Birinchi to‘lov' : 'Qo‘shimcha to‘lov',
          managerId: options.managerId,
          accountantId: ctx.users.accountant.id,
          createdAt: payment.paidAt,
        })),
      },
    },
    select: { id: true, number: true },
  });
  return student;
}

async function seedLeadsAndStudents(ctx: DemoContext): Promise<{ leads: number; students: number }> {
  const { users } = ctx;
  const salesTeam = [users.manager, users.manager, users.manager2, users.manager2, users.callCenter];
  const activeGroupsByCourse = new Map<string, GroupRef>();
  for (const group of ctx.groups) {
    if (group.status === 'ACTIVE' && !activeGroupsByCourse.has(group.courseId)) {
      activeGroupsByCourse.set(group.courseId, group);
    }
  }
  const lastWonIndex = LEAD_STATUS_PLAN.lastIndexOf('WON');

  let contractIndex = 1;
  let studentCount = 0;
  let followUpBucket = 0;
  let wonCounter = 0;

  for (const [index, status] of LEAD_STATUS_PLAN.entries()) {
    const person = generatePerson();
    const isTodaySale = index === lastWonIndex;
    const [minDays, maxDays] = isTodaySale ? [10, 10] : CREATED_DAYS_AGO[status];
    const newToday = status === 'NEW' && index < 3;

    const createdAt = newToday
      ? addMinutes(NOW, -randomInt(15, 240))
      : earliest(
          addHours(startOfToday(), -24 * randomInt(minDays, maxDays) + randomInt(9, 19)),
          addMinutes(NOW, -30),
        );

    const unassigned = status === 'NEW' && (index === 1 || index === 5);
    const assignee = unassigned ? null : at(salesTeam, index);
    const creator = assignee ?? users.callCenter;
    const sourceKey = pick(SOURCE_WEIGHTS);
    const sourceId = ctx.sourceIdByKey.get(sourceKey);
    if (!sourceId) throw new Error(`Manba topilmadi: ${sourceKey}`);
    const course = status === 'WON' || chance(0.9) ? pick(ctx.courses) : null;

    // Voqealar vaqt chizig‘i: yaratilgan paytdan oxirgi statusgacha
    const path = statusPath(status);
    // Oxirgi voqea yaratilgan payt va hozirgi vaqt oralig‘ining 55–95% qismida — konversiyalar vaqt bo‘yicha tarqaladi.
    const lifetimeMs = NOW.getTime() - createdAt.getTime();
    const timelineEnd = isTodaySale
      ? addHours(NOW, -2)
      : latest(
          addHours(createdAt, path.length),
          earliest(new Date(createdAt.getTime() + lifetimeMs * (0.55 + random() * 0.4)), addHours(NOW, -1)),
        );
    const eventTimes = path.map((_, step) =>
      path.length === 1
        ? createdAt
        : new Date(createdAt.getTime() + ((timelineEnd.getTime() - createdAt.getTime()) * step) / (path.length - 1)),
    );

    const activities: ActivityInput[] = [
      {
        type: 'CREATED',
        description: `Lead yaratildi (manba: ${SOURCES.find((item) => item.key === sourceKey)?.name ?? sourceKey})`,
        userId: creator.id,
        createdAt,
      },
    ];
    if (assignee) {
      activities.push({
        type: 'ASSIGNED',
        description: `Lead ${assignee.firstName} ${assignee.lastName}ga biriktirildi`,
        userId: creator.id,
        createdAt: addMinutes(createdAt, 2),
      });
    }

    const calls: CallInput[] = [];
    const callerId = assignee?.id ?? users.callCenter.id;

    for (let step = 1; step < path.length; step += 1) {
      const from = path[step - 1];
      const to = path[step];
      const eventAt = eventTimes[step];
      if (!from || !to || !eventAt) continue;

      const callResult = CALL_RESULT_FOR_STATUS[to];
      if (callResult) {
        if (to === 'CONTACTED' && chance(0.4)) {
          const missedAt = addHours(eventAt, -randomInt(3, 20));
          calls.push({ managerId: callerId, result: 'NO_ANSWER', calledAt: latest(missedAt, addMinutes(createdAt, 5)), durationSec: 0, notes: CALL_NOTES.NO_ANSWER, nextCallAt: eventAt });
        }
        const calledAt = addMinutes(eventAt, -10);
        calls.push({
          managerId: callerId,
          result: callResult,
          calledAt,
          durationSec: randomInt(60, 420),
          notes: CALL_NOTES[callResult],
          nextCallAt: to === 'CALLBACK' ? addHours(calledAt, 24) : null,
        });
        activities.push({
          type: 'CALL_LOGGED',
          description: `Telefon orqali bog‘lanildi — ${CALL_NOTES[callResult]}`,
          userId: callerId,
          createdAt: calledAt,
        });
      }

      activities.push({
        type: 'STATUS_CHANGED',
        description:
          to === 'TRIAL_BOOKED'
            ? `Sinov darsi belgilandi (status: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]})`
            : `Status o‘zgardi: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`,
        userId: callerId,
        createdAt: eventAt,
        metadata: { from, to },
      });
    }

    // Follow-uplar
    const followUps: FollowUpInput[] = [];
    const lastEventAt = eventTimes[eventTimes.length - 1] ?? createdAt;
    const pendingTitle = FOLLOW_UP_TITLES[status];
    const needsPendingFollowUp = pendingTitle !== undefined && (status !== 'NEW' || (assignee !== null && chance(0.6)));

    if (path.length > 2) {
      const doneAt = eventTimes[1] ?? createdAt;
      followUps.push({
        assignedToId: callerId,
        createdById: callerId,
        title: FOLLOW_UP_TITLES.CONTACTED ?? 'Mijoz bilan bog‘lanish',
        dueAt: addHours(doneAt, 20),
        remindAt: addHours(doneAt, 19.5),
        status: 'DONE',
        completedAt: addHours(doneAt, 21),
        createdAt: doneAt,
      });
      activities.push({ type: 'FOLLOW_UP_COMPLETED', description: 'Follow-up bajarildi: kurs haqida ma’lumot yuborildi', userId: callerId, createdAt: addHours(doneAt, 21) });
    }

    let nextFollowUpAt: Date | null = null;
    if (needsPendingFollowUp) {
      const bucket = at(FOLLOW_UP_BUCKETS, followUpBucket);
      followUpBucket += 1;
      const dueAt = followUpDueAt(bucket);
      nextFollowUpAt = dueAt;
      const createdFollowUpAt = earliest(addMinutes(lastEventAt, 5), addMinutes(NOW, -5));
      followUps.push({
        assignedToId: assignee?.id ?? users.manager.id,
        createdById: callerId,
        title: pendingTitle,
        dueAt,
        remindAt: addMinutes(dueAt, -30),
        status: 'PENDING',
        completedAt: null,
        createdAt: createdFollowUpAt,
      });
      activities.push({ type: 'FOLLOW_UP_CREATED', description: `Follow-up yaratildi: ${pendingTitle}`, userId: callerId, createdAt: createdFollowUpAt });
    }

    const noteContent = chance(0.5) ? pick(NOTE_TEXTS) : null;
    if (noteContent) {
      activities.push({ type: 'NOTE_ADDED', description: 'Izoh qo‘shildi', userId: callerId, createdAt: addMinutes(lastEventAt, 1) });
    }

    const contacted = calls.filter((call) => call.result !== 'NO_ANSWER');
    const lastContactedAt = contacted.length > 0 ? (contacted[contacted.length - 1]?.calledAt ?? null) : null;
    const convertedAt = status === 'WON' ? lastEventAt : null;
    const address = chance(0.6) ? pick(ADDRESSES) : null;

    const lead = await prisma.lead.create({
      data: {
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        telegram: person.telegram,
        email: person.email,
        age: randomInt(14, 35),
        gender: person.gender,
        address,
        status,
        priority: pick(PRIORITY_WEIGHTS),
        notes: course ? `${course.name} kursiga qiziqish bildirdi.` : 'Qaysi kursni tanlashni hali hal qilmagan.',
        lostReason: status === 'LOST' ? pick(LOST_REASONS) : null,
        nextFollowUpAt,
        lastContactedAt,
        convertedAt,
        sourceId,
        courseId: course?.id ?? null,
        assignedToId: assignee?.id ?? null,
        createdById: creator.id,
        createdAt,
        updatedAt: lastEventAt,
        activities: {
          create: activities
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((activity) => ({ ...activity, metadata: activity.metadata ?? undefined })),
        },
        calls: {
          create: calls.map((call) => ({ ...call, direction: 'OUTGOING' as const, status: 'COMPLETED' as const, createdAt: call.calledAt })),
        },
        followUps: { create: followUps },
        leadNotes: noteContent ? { create: [{ authorId: callerId, content: noteContent, createdAt: addMinutes(lastEventAt, 1) }] } : undefined,
      },
      select: { id: true },
    });

    if (status === 'WON' && course && convertedAt) {
      const student = await createStudentWithPayments({
        ctx,
        person,
        course,
        group: activeGroupsByCourse.get(course.id),
        leadId: lead.id,
        managerId: assignee?.id ?? null,
        createdById: callerId,
        startAt: convertedAt,
        status: 'ACTIVE',
        fraction: at(PAYMENT_FRACTIONS, wonCounter),
        contractIndex,
        address,
        ...(isTodaySale ? { lastPaymentAt: addMinutes(NOW, -90) } : {}),
      });
      contractIndex += 1;
      wonCounter += 1;
      studentCount += 1;

      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: callerId,
          type: 'CONVERTED_TO_STUDENT',
          description: `O‘quvchiga aylantirildi (ST-${String(student.number).padStart(6, '0')})`,
          createdAt: addMinutes(convertedAt, 5),
        },
      });
    }
  }

  // Leadsiz to‘g‘ridan-to‘g‘ri qabul qilingan o‘quvchilar (guruhlarni to‘ldirish uchun)
  const activeGroups = ctx.groups.filter((group) => group.status === 'ACTIVE');
  const directStatuses: readonly StudentStatus[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'FROZEN', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'DROPPED', 'ACTIVE', 'ACTIVE'];

  for (const [index, status] of directStatuses.entries()) {
    const group = at(activeGroups, index);
    const course = ctx.courses.find((item) => item.id === group.courseId);
    if (!course) continue;
    const startAt = earliest(
      new Date(group.startDate.getTime() + randomInt(0, 10) * DAY + 10 * HOUR),
      addHours(NOW, -24),
    );
    await createStudentWithPayments({
      ctx,
      person: generatePerson(),
      course,
      group,
      leadId: null,
      managerId: at([users.manager, users.manager2], index).id,
      createdById: users.admin.id,
      startAt,
      status,
      fraction: at(PAYMENT_FRACTIONS, index + 3),
      contractIndex,
      address: chance(0.6) ? pick(ADDRESSES) : null,
    });
    contractIndex += 1;
    studentCount += 1;
  }

  return { leads: LEAD_STATUS_PLAN.length, students: studentCount };
}

/** Faol guruhlar uchun oxirgi 4 ta dars kunining davomati. */
async function seedAttendance(groups: readonly GroupRef[]): Promise<number> {
  let total = 0;
  for (const group of groups.filter((item) => item.status === 'ACTIVE')) {
    const students = await prisma.student.findMany({
      where: { groupId: group.id, status: { in: ['ACTIVE', 'FROZEN'] } },
      select: { id: true, createdAt: true },
    });
    if (students.length === 0) continue;

    const lessonDates: Date[] = [];
    for (let offset = -1; offset >= -21 && lessonDates.length < 4; offset -= 1) {
      const date = dateOnly(offset);
      const weekDay = WEEKDAY_BY_UTC_DAY[date.getUTCDay()];
      if (weekDay && group.scheduleDays.includes(weekDay) && date >= group.startDate) {
        lessonDates.push(date);
      }
    }

    const records = lessonDates.flatMap((date) =>
      students
        .filter((student) => dateOnly(0, student.createdAt) <= date)
        .map((student) => {
          const roll = random();
          const status: AttendanceStatus = roll < 0.8 ? 'PRESENT' : roll < 0.88 ? 'LATE' : roll < 0.95 ? 'ABSENT' : 'EXCUSED';
          return { studentId: student.id, groupId: group.id, date, status, markedById: group.teacherId };
        }),
    );

    if (records.length > 0) {
      const created = await prisma.attendance.createMany({ data: records, skipDuplicates: true });
      total += created.count;
    }
  }
  return total;
}

async function seedNotifications(ctx: DemoContext): Promise<number> {
  const todayLeads = await prisma.lead.findMany({
    where: { createdAt: { gte: startOfToday() }, assignedToId: { not: null } },
    select: { id: true, firstName: true, lastName: true, assignedToId: true },
  });
  const todayPayments = await prisma.payment.findMany({
    where: { paidAt: { gte: startOfToday() } },
    select: { id: true, amount: true, student: { select: { firstName: true, lastName: true } } },
  });

  const notifications = [
    ...todayLeads.map((lead) => ({
      userId: lead.assignedToId ?? ctx.users.manager.id,
      type: 'NEW_LEAD' as const,
      title: 'Yangi lead',
      message: `${lead.firstName} ${lead.lastName ?? ''} sizga biriktirildi`.trim(),
      entityType: 'lead',
      entityId: lead.id,
      dedupeKey: `new-lead:${lead.id}`,
    })),
    ...todayPayments.flatMap((payment) =>
      [ctx.users.accountant.id, ctx.users.admin.id].map((userId) => ({
        userId,
        type: 'NEW_PAYMENT' as const,
        title: 'Yangi to‘lov',
        message: `${payment.student.firstName} ${payment.student.lastName}: ${payment.amount.toNumber().toLocaleString('uz-UZ')} so‘m`,
        entityType: 'payment',
        entityId: payment.id,
        dedupeKey: `new-payment:${payment.id}:${userId}`,
      })),
    ),
    {
      userId: ctx.users.admin.id,
      type: 'SYSTEM' as const,
      title: 'CRM tayyor',
      message: 'Demo ma’lumotlar yuklandi. Xodimlar va sozlamalarni tekshirib chiqing.',
      entityType: null,
      entityId: null,
      dedupeKey: 'system:seed-welcome',
    },
  ];

  const created = await prisma.notification.createMany({ data: notifications, skipDuplicates: true });
  return created.count;
}

async function seedDemoData(ctx: DemoContext): Promise<void> {
  const existingLeads = await prisma.lead.count();
  if (existingLeads > 0) {
    log(`• Demo ma’lumotlar o‘tkazib yuborildi: bazada allaqachon ${existingLeads} ta lead bor (tozalash: npm run db:reset)`);
    return;
  }

  const { leads, students } = await seedLeadsAndStudents(ctx);
  log(`✔ ${leads} ta lead (qo‘ng‘iroqlar, follow-up, izohlar, timeline bilan)`);
  log(`✔ ${students} ta o‘quvchi (shartnoma, to‘lovlar, qarzdorlik bilan)`);

  const attendance = await seedAttendance(ctx.groups);
  log(`✔ ${attendance} ta davomat yozuvi`);

  const notifications = await seedNotifications(ctx);
  log(`✔ ${notifications} ta bildirishnoma`);
}

async function main(): Promise<void> {
  log('\nSeed boshlandi...\n');
  const roleIdByKey = await seedRolesAndPermissions(prisma, log);
  const users = await seedUsers(roleIdByKey);
  const sourceIdByKey = await seedLeadSources(prisma, log);
  const courses = await seedCourses(users);
  const groups = await seedGroups(users, courses);
  await seedSettings(users.admin.id);
  await seedDemoData({ users, sourceIdByKey, courses, groups });
  log(`✔ ${await backfillPaymentSchedules(prisma)} ta o‘quvchiga to‘lov jadvali`);
  log(`✔ ${await backfillGroupHistory(prisma)} ta o‘quvchiga guruh tarixi`);
  await seedAcademyModules(prisma, log);

  log('\nSeed yakunlandi. Kirish ma’lumotlari:');
  for (const user of SEED_USERS) {
    log(`  ${user.role.padEnd(14)} ${user.email.padEnd(24)} ${user.password}${user.status === 'PENDING' ? '  (tasdiqlanmagan)' : ''}`);
  }
  log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    process.stderr.write(`\nSeed xatolik bilan tugadi:\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
