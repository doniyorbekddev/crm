import { MAIN_BRANCH_ID } from '../../config/branch.js';
import { EMPLOYEE_POSITION_LABELS } from '../../config/employeeLabels.js';
import type { EmployeePosition, Prisma, PrismaClient } from '../../generated/prisma/client.js';

/**
 * Tuzilma katalogining standart qiymatlari (ORG hujjati §2, §3.2) va ularni bazaga yozish.
 * Alohida modul: deploy skripti (`prisma/syncPermissions.ts`) ilova servislarini yuklamasdan chaqiradi.
 */

export const TEACHER_POSITION_KEY = 'TEACHER';

type Db = PrismaClient | Prisma.TransactionClient;

interface DefaultPosition {
  department: string;
  probationMonths: number;
  description?: string;
  responsibilities?: string[];
}

export const DEFAULT_DEPARTMENTS = ['Boshqaruv', 'Sotuv va qabulxona', 'Marketing va kontent', 'O‘quv bo‘limi', 'Moliya', 'Xo‘jalik va boshqalar'] as const;

/** ORG hujjati §2 bo'yicha standart lavozimlar. Rahbarlik lavozimlarida sinov — 3 oy (§3.2) */
const DEFAULT_POSITIONS: Record<EmployeePosition | typeof TEACHER_POSITION_KEY, DefaultPosition> = {
  MANAGER: { department: 'Boshqaruv', probationMonths: 3 },
  OPERATIONS_MANAGER: {
    department: 'Boshqaruv',
    probationMonths: 3,
    description: 'Kelajakdagi lavozim: kundalik operatsion jarayonlar. Ishga olinmaguncha vazifalari CEO va amaldagi mas’ullar o‘rtasida taqsimlanadi.',
  },
  STUDENT_SUCCESS_MANAGER: {
    department: 'Boshqaruv',
    probationMonths: 3,
    description: 'Kelajakdagi lavozim: o‘quvchilarni saqlab qolish va o‘qishni davom ettirish.',
    responsibilities: ['Ketish xavfi bo‘lgan o‘quvchilar bilan aloqa', 'O‘qishni davom ettirish (qayta ro‘yxatdan o‘tish)', 'O‘quvchi va ota-ona fikrlarini yig‘ish'],
  },
  SALES_MANAGER: {
    department: 'Sotuv va qabulxona',
    probationMonths: 1,
    responsibilities: [
      'Yangi leadlar bilan ishlash',
      'Telefon va messenjer orqali mijozlarga javob berish',
      'Kurslarni tushuntirish va sotuvni amalga oshirish',
      'Sinov darslarini tashkil qilish',
      'Leadlarni CRMda yuritish',
      'Sotuv voronkasini nazorat qilish',
      'O‘quvchilarni qayta ro‘yxatdan o‘tkazish va davom ettirish',
      'Ketish xavfi mavjud o‘quvchilar bilan aloqa qilish',
    ],
    description: 'Chegirma vakolati: 0–5% — mustaqil; 5% dan yuqori, maxsus aksiya va individual narx — CEO tasdig‘i. Har chegirma sababi bilan CRMda qayd etiladi.',
  },
  RECEPTIONIST: {
    department: 'Sotuv va qabulxona',
    probationMonths: 1,
    responsibilities: [
      'O‘quvchilar va ota-onalarni kutib olish',
      'Murojaatlarni qabul qilish va CRMga kiritish',
      'To‘lovlarni qabul qilish va qayd etish',
      'Qarzdorlikni kuzatish',
      'To‘lov muddati bo‘yicha eslatmalar',
      'Shikoyatlarni qabul qilish va tegishli mas’ulga yo‘naltirish',
      'Kassa operatsiyalari bo‘yicha hisobot',
    ],
    description: 'To‘lov CRMda faqat haqiqiy tushum yoki tasdiqlangan to‘lov dalili asosida qayd etiladi.',
  },
  ADMINISTRATOR: { department: 'Sotuv va qabulxona', probationMonths: 1 },
  CALL_CENTER: { department: 'Sotuv va qabulxona', probationMonths: 1 },
  MARKETING_MANAGER: {
    department: 'Marketing va kontent',
    probationMonths: 3,
    responsibilities: ['Marketing strategiyasi', 'Reklama budjeti', 'Target va pullik reklama', 'Kampaniyalar natijalarini tahlil qilish', 'Leadlar soni va sifati', 'CPL, konversiya va reklama ROI nazorati'],
  },
  CONTENT_CREATOR: {
    department: 'Marketing va kontent',
    probationMonths: 1,
    responsibilities: [
      'Video tasvirga olish',
      'Video montaj',
      'Tasdiqlangan videolarni Instagram va Telegramga joylash',
      'Kontent topshiriqlarini muddatida bajarish',
      'Tayyor materiallarni CRM yoki kelishilgan joyga topshirish',
    ],
    description: 'Pullik reklama, target va reklama budjetini boshqarmaydi — bu CEO vakolatida.',
  },
  ACADEMIC_COORDINATOR: {
    department: 'O‘quv bo‘limi',
    probationMonths: 3,
    description: 'Kelajakdagi lavozim (Academic Coordinator / Senior Teacher). Hozircha akademik boshqaruv CEO zimmasida.',
  },
  TEACHER: {
    department: 'O‘quv bo‘limi',
    probationMonths: 1,
    description: 'Dars jadvali asosida ishlaydi. Sinov muddati — demo darsdan keyin 1 oy.',
    responsibilities: [
      'Darsga o‘z vaqtida kelish',
      'Dars sifati va metodika',
      'O‘quvchilar davomati',
      'O‘quvchilar bilimining o‘sishi',
      'Uy vazifalari va test natijalari',
      'O‘quvchi va ota-ona fikrlari',
      'Davomat yoki bilim pasayishini CEOga bildirish',
    ],
  },
  ACCOUNTANT: { department: 'Moliya', probationMonths: 1 },
  CLEANER: { department: 'Xo‘jalik va boshqalar', probationMonths: 1 },
  SECURITY: { department: 'Xo‘jalik va boshqalar', probationMonths: 1 },
  OTHER: { department: 'Xo‘jalik va boshqalar', probationMonths: 1 },
};

export function positionTitle(key: string): string {
  return key === TEACHER_POSITION_KEY ? 'O‘qituvchi' : (EMPLOYEE_POSITION_LABELS[key as EmployeePosition] ?? key);
}

/**
 * Standart bo'lim (asosiy filialda) va lavozimlarni yaratadi — faqat yo'qlarini. Deployda (`syncPermissions`) va
 * katalog birinchi ochilganda chaqiriladi; takror chaqirish xavfsiz.
 */
export async function ensureOrgCatalog(db: Db): Promise<void> {
  const existing = await db.position.count();
  const branchExists = await db.branch.count({ where: { id: MAIN_BRANCH_ID } });
  if (branchExists === 0) return;
  for (const [index, name] of DEFAULT_DEPARTMENTS.entries()) {
    await db.department.upsert({ where: { branchId_name: { branchId: MAIN_BRANCH_ID, name } }, update: {}, create: { name, branchId: MAIN_BRANCH_ID, sortOrder: index } });
  }
  if (existing >= Object.keys(DEFAULT_POSITIONS).length) return;
  const departments = new Map((await db.department.findMany({ where: { branchId: MAIN_BRANCH_ID }, select: { id: true, name: true } })).map((row) => [row.name, row.id]));
  for (const [index, [key, spec]] of Object.entries(DEFAULT_POSITIONS).entries()) {
    const found = await db.position.findUnique({ where: { key }, select: { id: true } });
    if (found) continue;
    await db.position.create({
      data: {
        key,
        title: positionTitle(key),
        departmentId: departments.get(spec.department) ?? null,
        description: spec.description ?? null,
        probationMonths: spec.probationMonths,
        sortOrder: index,
        responsibilities: { create: (spec.responsibilities ?? []).map((title, order) => ({ title, sortOrder: order })) },
      },
    });
  }
}

