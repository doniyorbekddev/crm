import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';
import { EMPLOYEE_STATUSES } from './employee.validator.js';

export const SALARY_TYPES = ['FIXED', 'PER_LESSON', 'PER_STUDENT', 'PERCENTAGE', 'MIXED'] as const;

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

/** So‘mdagi summa — butun son (tiyin ishlatilmaydi) */
function moneySchema(label: string) {
  return z.coerce
    .number(`${label} raqam bo‘lishi kerak`)
    .int(`${label} butun son bo‘lishi kerak`)
    .min(0, `${label} manfiy bo‘lmasligi kerak`)
    .max(999_999_999, `${label} juda katta`);
}

export const teacherListQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  salaryType: z.enum(SALARY_TYPES, 'Maosh modeli noto‘g‘ri').optional(),
  employmentStatus: z.enum(EMPLOYEE_STATUSES, 'Holat noto‘g‘ri').optional(),
  sortBy: z.enum(['name', 'hireDate', 'createdAt']).default('name'),
});

const profileFieldsSchema = z.object({
  specialization: optionalField(z.string().trim().max(150, 'Mutaxassislik juda uzun')),
  experienceYears: optionalField(
    z.coerce
      .number('Tajriba raqam bo‘lishi kerak')
      .int('Tajriba butun son bo‘lishi kerak')
      .min(0, 'Tajriba manfiy bo‘lmasligi kerak')
      .max(60, 'Tajriba 60 yildan oshmasligi kerak'),
  ),
  hireDate: optionalField(dateOnlySchema),
  bio: optionalField(z.string().trim().max(1000, 'Izoh 1000 belgidan oshmasligi kerak')),
});

export const createTeacherProfileSchema = profileFieldsSchema.extend({
  userId: z.string('Xodimni tanlang').trim().min(1, 'Xodimni tanlang').max(50),
});

export const updateTeacherProfileSchema = profileFieldsSchema.extend({
  /** Eski mijozlar uchun: false — ishdan ketgan (sana bugun), true — qayta faol */
  isActive: z.boolean().optional(),
  /** HR holati; berilsa isActive o‘rniga ishlatiladi */
  employmentStatus: z.enum(EMPLOYEE_STATUSES, 'Holatni tanlang').optional(),
  terminationDate: optionalField(dateOnlySchema),
});

/** Yangi maosh modeli. Eskisi tarix uchun saqlanadi (effectiveTo yopiladi). */
export const createSalaryRuleSchema = z
  .object({
    type: z.enum(SALARY_TYPES, 'Maosh modelini tanlang'),
    baseSalary: moneySchema('Asosiy maosh').default(0),
    perLessonRate: moneySchema('Bir dars uchun to‘lov').default(0),
    perStudentRate: moneySchema('Bir o‘quvchi uchun to‘lov').default(0),
    percentage: z.coerce
      .number('Foiz raqam bo‘lishi kerak')
      .min(0, 'Foiz manfiy bo‘lmasligi kerak')
      .max(100, 'Foiz 100 dan oshmasligi kerak')
      .default(0),
    bonus: moneySchema('Bonus').default(0),
    effectiveFrom: dateOnlySchema,
    note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  })
  .superRefine((values, context) => {
    const required: Array<{ types: readonly string[]; field: keyof typeof values; message: string }> = [
      { types: ['FIXED'], field: 'baseSalary', message: 'Belgilangan maosh uchun asosiy maosh kiritilishi kerak' },
      { types: ['PER_LESSON'], field: 'perLessonRate', message: 'Dars uchun to‘lov kiritilishi kerak' },
      { types: ['PER_STUDENT'], field: 'perStudentRate', message: 'O‘quvchi uchun to‘lov kiritilishi kerak' },
      { types: ['PERCENTAGE'], field: 'percentage', message: 'Ulush foizi kiritilishi kerak' },
    ];
    for (const rule of required) {
      if (rule.types.includes(values.type) && Number(values[rule.field]) <= 0) {
        context.addIssue({ code: 'custom', path: [rule.field], message: rule.message });
      }
    }
    if (
      values.type === 'MIXED' &&
      values.baseSalary <= 0 &&
      values.perLessonRate <= 0 &&
      values.perStudentRate <= 0 &&
      values.percentage <= 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['baseSalary'],
        message: 'Aralash modelda kamida bitta tarkibiy qism kiritilishi kerak',
      });
    }
  });

export type TeacherListQuery = z.infer<typeof teacherListQuerySchema>;
export type CreateTeacherProfileInput = z.infer<typeof createTeacherProfileSchema>;
export type UpdateTeacherProfileInput = z.infer<typeof updateTeacherProfileSchema>;
export type CreateSalaryRuleInput = z.infer<typeof createSalaryRuleSchema>;
