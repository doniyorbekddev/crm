import { z } from 'zod';
import { optionalField, phoneSchema } from './common.validator.js';
import { EMPLOYEE_POSITIONS } from './employee.validator.js';

/** ORG tizimi modullarining kiritish sxemalari */

const id = z.string().trim().min(1).max(50);
const booleanFlag = z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

// ---------------------------------------------------------------- murojaatlar (§7)

export const COMPLAINT_SOURCES = ['STUDENT', 'PARENT', 'STAFF', 'OTHER'] as const;
export const COMPLAINT_CATEGORIES = ['SERVICE', 'TEACHER', 'PAYMENT', 'SCHEDULE', 'SAFETY', 'STAFF_CONFLICT', 'SUGGESTION', 'OTHER'] as const;
export const COMPLAINT_SEVERITIES = ['NORMAL', 'HIGH', 'CRITICAL'] as const;
export const COMPLAINT_STATUSES = ['NEW', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED'] as const;

const complaintTitle = z.string('Mavzuni kiriting').trim().min(3, 'Mavzu kamida 3 belgi').max(200, 'Mavzu 200 belgidan oshmasin');
const complaintDescription = z.string('Murojaat matnini kiriting').trim().min(5, 'Matn kamida 5 belgi').max(4000, 'Matn 4000 belgidan oshmasin');
const note = z.string().trim().min(1).max(2000, 'Izoh 2000 belgidan oshmasin');

export const complaintListQuerySchema = z.object({
  status: z.enum(COMPLAINT_STATUSES, 'Holat noto‘g‘ri').optional(),
  category: z.enum(COMPLAINT_CATEGORIES, 'Turkum noto‘g‘ri').optional(),
  severity: z.enum(COMPLAINT_SEVERITIES, 'Jiddiylik noto‘g‘ri').optional(),
  /** mine — men kiritgan yoki menga biriktirilgan */
  scope: z.enum(['mine', 'all']).default('all'),
  overdue: booleanFlag.optional(),
  search: z.string().trim().max(100).optional(),
  page,
  limit,
});
export type ComplaintListQuery = z.infer<typeof complaintListQuerySchema>;

export const complaintCreateSchema = z
  .object({
    source: z.enum(COMPLAINT_SOURCES, 'Murojaat kimdan kelganini tanlang'),
    category: z.enum(COMPLAINT_CATEGORIES, 'Turkumni tanlang'),
    severity: z.enum(COMPLAINT_SEVERITIES, 'Jiddiylik noto‘g‘ri').default('NORMAL'),
    title: complaintTitle,
    description: complaintDescription,
    studentId: optionalField(id),
    contactName: optionalField(z.string().trim().max(150, 'Ism juda uzun')),
    contactPhone: optionalField(phoneSchema),
    subjectUserId: optionalField(id),
    assigneeId: optionalField(id),
    confidential: z.boolean().default(false),
  })
  .refine((value) => value.source === 'STAFF' || value.studentId || value.contactName || value.contactPhone, {
    path: ['contactName'],
    message: 'O‘quvchini tanlang yoki murojaatchining ismi/telefonini kiriting',
  });
export type ComplaintCreateInput = z.infer<typeof complaintCreateSchema>;

/** Xodimning o'z murojaati: manba har doim STAFF, kirituvchi — o'zi */
export const staffAppealSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES, 'Turkumni tanlang'),
  severity: z.enum(COMPLAINT_SEVERITIES, 'Jiddiylik noto‘g‘ri').default('NORMAL'),
  title: complaintTitle,
  description: complaintDescription,
  subjectUserId: optionalField(id),
  confidential: z.boolean().default(true),
});
export type StaffAppealInput = z.infer<typeof staffAppealSchema>;

export const complaintAssignSchema = z.object({
  assigneeId: z.string('Mas’ulni tanlang').trim().min(1, 'Mas’ulni tanlang').max(50),
  note: optionalField(z.string().trim().max(500, 'Izoh 500 belgidan oshmasin')),
});
export type ComplaintAssignInput = z.infer<typeof complaintAssignSchema>;

export const complaintStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'CLOSED'], 'Holat noto‘g‘ri'),
  note: optionalField(note),
});
export type ComplaintStatusInput = z.infer<typeof complaintStatusSchema>;

export const complaintNoteSchema = z.object({ note: z.string('Izohni kiriting').trim().min(1, 'Izohni kiriting').max(2000, 'Izoh 2000 belgidan oshmasin') });

// ---------------------------------------------------------------- aktivlar (§11)

export const ASSET_STATUSES = ['IN_USE', 'IN_STORAGE', 'UNDER_REPAIR', 'WRITTEN_OFF', 'LOST'] as const;

const dateOnly = (label: string) =>
  z
    .string(`${label}ni kiriting`)
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-11-03')
    .transform((value) => new Date(`${value}T00:00:00.000Z`));
const money = z.coerce.number('Summa raqam bo‘lishi kerak').min(0, 'Summa manfiy bo‘lmasin').max(999_999_999_999, 'Summa juda katta');

const assetFields = {
  inventoryNumber: z.string('Inventar raqamini kiriting').trim().min(1, 'Inventar raqamini kiriting').max(50, 'Raqam 50 belgidan oshmasin'),
  name: z.string('Nomini kiriting').trim().min(2, 'Nom kamida 2 belgi').max(150, 'Nom 150 belgidan oshmasin'),
  category: z.string('Turkumni kiriting').trim().min(2, 'Turkum kamida 2 belgi').max(80, 'Turkum 80 belgidan oshmasin'),
  serialNumber: optionalField(z.string().trim().max(100, 'Seriya raqami juda uzun')),
  purchaseDate: optionalField(dateOnly('Xarid sanasi')),
  purchaseCost: optionalField(money),
  /** Texnik holati: "yangi", "yaxshi", "chizilgan"… */
  condition: optionalField(z.string().trim().max(100, 'Holat 100 belgidan oshmasin')),
  note: optionalField(z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasin')),
};

export const assetListQuerySchema = z.object({
  status: z.enum(ASSET_STATUSES, 'Holat noto‘g‘ri').optional(),
  category: z.string().trim().max(80).optional(),
  responsibleId: z.string().trim().max(50).optional(),
  search: z.string().trim().max(100).optional(),
  page,
  limit,
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export const assetCreateSchema = z.object({
  ...assetFields,
  status: z.enum(ASSET_STATUSES, 'Holat noto‘g‘ri').default('IN_USE'),
  roomId: optionalField(id),
  location: optionalField(z.string().trim().max(150, 'Joylashuv juda uzun')),
  responsibleId: optionalField(id),
});
export type AssetCreateInput = z.infer<typeof assetCreateSchema>;

/** Tahrirlash: bo'sh satr yoki null — maydonni tozalash (inventar raqami, nom va turkumdan tashqari) */
const clear = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' ? null : value), schema.nullable().optional());
export const assetUpdateSchema = z
  .object({
    inventoryNumber: assetFields.inventoryNumber.optional(),
    name: assetFields.name.optional(),
    category: assetFields.category.optional(),
    serialNumber: clear(z.string().trim().max(100, 'Seriya raqami juda uzun')),
    purchaseDate: clear(dateOnly('Xarid sanasi')),
    purchaseCost: clear(money),
    condition: clear(z.string().trim().max(100, 'Holat 100 belgidan oshmasin')),
    note: clear(z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasin')),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'O‘zgartiriladigan maydon yo‘q');
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>;

const eventNote = optionalField(z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasin'));
const occurredAt = optionalField(z.coerce.date('Sana noto‘g‘ri').refine((value) => value.getTime() <= Date.now() + 60_000, 'Kelajakdagi sana bo‘lmaydi'));
export const assetEventSchema = z.discriminatedUnion('type', [
  /** responsibleId bo'sh — mas'uldan olish (omborga) */
  /** `condition` — topshirish/qaytarish paytidagi texnik holat (aktiv kartasida yangilanadi) */
  z.object({ type: z.literal('ASSIGNED'), responsibleId: optionalField(id), condition: optionalField(z.string().trim().max(100, 'Holat 100 belgidan oshmasin')), note: eventNote, occurredAt }),
  z.object({ type: z.literal('MOVED'), roomId: optionalField(id), location: optionalField(z.string().trim().max(150, 'Joylashuv juda uzun')), note: eventNote, occurredAt }),
  z.object({ type: z.literal('STATUS_CHANGED'), status: z.enum(ASSET_STATUSES, 'Holatni tanlang'), note: eventNote, occurredAt }),
  z.object({ type: z.literal('REPAIR'), cost: optionalField(money), note: z.string('Nima ta’mirlanganini yozing').trim().min(3, 'Nima ta’mirlanganini yozing').max(1000), occurredAt }),
]);
export type AssetEventInput = z.infer<typeof assetEventSchema>;

// ---------------------------------------------------------------- bilimlar bazasi (§14)

export const KNOWLEDGE_CATEGORIES = ['JOB_DESCRIPTION', 'POLICY', 'VIDEO_GUIDE', 'SALES_SCRIPT', 'LESSON_STANDARD', 'MATERIAL', 'OTHER'] as const;
export const KNOWLEDGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/** Faqat https havola (video: YouTube, Telegram, Drive…) */
const videoUrl = z
  .string()
  .trim()
  .max(500, 'Havola juda uzun')
  .regex(/^https:\/\/[^\s]+$/, 'Havola https:// bilan boshlansin');

export const knowledgeListQuerySchema = z.object({
  category: z.enum(KNOWLEDGE_CATEGORIES, 'Turkum noto‘g‘ri').optional(),
  status: z.enum(KNOWLEDGE_STATUSES, 'Holat noto‘g‘ri').optional(),
  /** Faqat men tanishishim kerak bo'lganlar */
  pendingAck: booleanFlag.optional(),
  search: z.string().trim().max(100).optional(),
});
export type KnowledgeListQuery = z.infer<typeof knowledgeListQuerySchema>;

export const knowledgeSaveSchema = z.object({
  title: z.string('Sarlavhani kiriting').trim().min(3, 'Sarlavha kamida 3 belgi').max(200, 'Sarlavha 200 belgidan oshmasin'),
  category: z.enum(KNOWLEDGE_CATEGORIES, 'Turkumni tanlang'),
  body: z.string('Matnni kiriting').trim().min(10, 'Matn kamida 10 belgi').max(100_000, 'Matn juda uzun'),
  videoUrl: clear(videoUrl),
  audienceRoleIds: z.array(id).max(50).default([]),
  /** Lavozim yo'riqnomasi qaysi lavozim uchun */
  position: clear(z.enum(EMPLOYEE_POSITIONS, 'Lavozim noto‘g‘ri')),
  requiresAck: z.boolean().default(false),
  /** Nima o'zgardi — versiya tarixiga yoziladi */
  changeNote: optionalField(z.string().trim().max(255, 'Izoh 255 belgidan oshmasin')),
});
export type KnowledgeSaveInput = z.infer<typeof knowledgeSaveSchema>;

export const knowledgeStatusSchema = z.object({ status: z.enum(KNOWLEDGE_STATUSES, 'Holat noto‘g‘ri') });

// ---------------------------------------------------------------- tuzilma katalogi

const optionalText = (max: number, message: string) => clear(z.string().trim().max(max, message));

export const departmentSaveSchema = z.object({
  name: z.string('Bo‘lim nomini kiriting').trim().min(2, 'Nom kamida 2 belgi').max(100, 'Nom 100 belgidan oshmasin').transform((value) => value.replace(/\s+/g, ' ')),
  description: optionalText(1000, 'Tavsif 1000 belgidan oshmasin'),
  parentId: clear(id),
  headUserId: clear(id),
  /** Oylik xarajat limiti, so'm (bo'sh — limit yo'q) */
  monthlyExpenseLimit: clear(money),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});
export type DepartmentSaveInput = z.infer<typeof departmentSaveSchema>;

export const positionUpdateSchema = z
  .object({
    title: z.string().trim().min(2, 'Nom kamida 2 belgi').max(120, 'Nom 120 belgidan oshmasin').optional(),
    departmentId: clear(id),
    description: optionalText(2000, 'Tavsif 2000 belgidan oshmasin'),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'HOURLY'], 'Bandlik turi noto‘g‘ri').optional(),
    probationMonths: z.coerce.number().int().min(0, 'Manfiy bo‘lmaydi').max(12, 'Sinov 12 oydan oshmaydi').optional(),
    /** Karyera yo'li: keyingi lavozim kaliti (bo'sh — yo'q) */
    nextPositionKey: clear(z.string().trim().max(40)),
    careerRequirements: optionalText(2000, 'Talablar 2000 belgidan oshmasin'),
    minimumKpiScore: clear(z.coerce.number().int().min(0).max(100, 'KPI 100% dan oshmaydi')),
    minimumMonths: clear(z.coerce.number().int().min(0).max(120, 'Juda katta')),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'O‘zgartiriladigan maydon yo‘q');
export type PositionUpdateInput = z.infer<typeof positionUpdateSchema>;

export const responsibilitySchema = z.object({
  title: z.string('Mas’uliyatni kiriting').trim().min(3, 'Kamida 3 belgi').max(200, '200 belgidan oshmasin'),
  description: optionalText(1000, 'Tavsif 1000 belgidan oshmasin'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'], 'Ustuvorlik noto‘g‘ri').default('NORMAL'),
  expectedResult: optionalText(500, 'Kutilgan natija 500 belgidan oshmasin'),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});
export type ResponsibilityInput = z.infer<typeof responsibilitySchema>;

// ---------------------------------------------------------------- HR: nomzodlar, onboarding, offboarding

export const CANDIDATE_STAGES = ['NEW', 'INTERVIEW', 'DEMO', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'] as const;

export const candidateListQuerySchema = z.object({
  stage: z.enum(CANDIDATE_STAGES, 'Bosqich noto‘g‘ri').optional(),
  /** Faqat jarayondagilar (qaror qabul qilinmagan) */
  active: booleanFlag.optional(),
  search: z.string().trim().max(100).optional(),
});
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;

const personName = (label: string) => z.string(`${label}ni kiriting`).trim().min(2, `${label} kamida 2 belgi`).max(100, `${label} juda uzun`);
const dateTime = clear(z.coerce.date('Sana noto‘g‘ri'));

export const candidateSaveSchema = z
  .object({
    firstName: personName('Ism'),
    lastName: personName('Familiya'),
    phone: optionalField(phoneSchema),
    email: optionalField(z.email('Email noto‘g‘ri').max(255)),
    position: optionalField(z.enum(EMPLOYEE_POSITIONS, 'Lavozim noto‘g‘ri')),
    isTeacher: z.boolean().default(false),
    positionTitle: optionalField(z.string().trim().max(120, 'Lavozim nomi juda uzun')),
    source: optionalField(z.string().trim().max(100, 'Manba juda uzun')),
    interviewAt: dateTime,
    demoAt: dateTime,
    score: clear(z.coerce.number().int().min(1, 'Baho 1–10').max(10, 'Baho 1–10')),
    notes: optionalField(z.string().trim().max(4000, 'Izoh 4000 belgidan oshmasin')),
  })
  .refine((value) => value.isTeacher || value.position, { path: ['position'], message: 'Lavozimni tanlang yoki o‘qituvchi deb belgilang' });
export type CandidateSaveInput = z.infer<typeof candidateSaveSchema>;

export const candidateStageSchema = z.object({
  stage: z.enum(['NEW', 'INTERVIEW', 'DEMO', 'OFFER', 'REJECTED', 'WITHDRAWN'], 'Bosqich noto‘g‘ri'),
  note: optionalField(z.string().trim().max(500, 'Izoh 500 belgidan oshmasin')),
});
export type CandidateStageInput = z.infer<typeof candidateStageSchema>;

export const candidateHireSchema = z.object({
  hireDate: dateOnly('Ishga kirish sanasi'),
  baseSalary: optionalField(z.coerce.number().int('Butun son').min(0).max(999_999_999)),
  /** Berilmasa — lavozimning standart sinov muddati bo'yicha */
  probationEndDate: optionalField(dateOnly('Sinov muddati')),
  /** CRM hisobi (bo'lsa) */
  userId: optionalField(id),
  note: optionalField(z.string().trim().max(500, 'Izoh 500 belgidan oshmasin')),
});
export type CandidateHireInput = z.infer<typeof candidateHireSchema>;

export const checklistListQuerySchema = z.object({
  kind: z.enum(['ONBOARDING', 'OFFBOARDING'], 'Turi noto‘g‘ri').optional(),
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED'], 'Holat noto‘g‘ri').optional(),
});

export const checklistCreateSchema = z
  .object({
    kind: z.enum(['ONBOARDING', 'OFFBOARDING'], 'Turini tanlang'),
    employeeId: optionalField(id),
    /** Xodim kartasi bo'lmasa (o'qituvchi) — CRM hisobi */
    userId: optionalField(id),
    reason: optionalField(z.string().trim().max(500, 'Sabab 500 belgidan oshmasin')),
    lastWorkingDay: optionalField(dateOnly('Oxirgi ish kuni')),
    dueDate: optionalField(dateOnly('Muddat')),
  })
  .refine((value) => value.employeeId || value.userId, { path: ['employeeId'], message: 'Xodimni tanlang' })
  .refine((value) => value.kind !== 'OFFBOARDING' || (value.reason && value.reason.length >= 3), { path: ['reason'], message: 'Ishdan ketish sababini yozing' })
  .refine((value) => value.kind !== 'OFFBOARDING' || value.lastWorkingDay, { path: ['lastWorkingDay'], message: 'Oxirgi ish kunini kiriting' });
export type ChecklistCreateInput = z.infer<typeof checklistCreateSchema>;

export const checklistItemSchema = z.object({
  done: z.boolean(),
  note: optionalField(z.string().trim().max(500, 'Izoh 500 belgidan oshmasin')),
});
export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;

export const handoverSchema = z.object({ assigneeId: z.string('Kimga topshirilishini tanlang').trim().min(1, 'Kimga topshirilishini tanlang').max(50) });
export const cancelSchema = z.object({ note: z.string('Sababni yozing').trim().min(3, 'Sababni yozing').max(500) });
