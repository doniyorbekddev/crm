import { z } from 'zod';
import { nameSchema, optionalField, paginationQuerySchema, phoneSchema } from './common.validator.js';

export const EMPLOYEE_POSITIONS = [
  'ADMINISTRATOR',
  'MANAGER',
  'SALES_MANAGER',
  'CALL_CENTER',
  'ACCOUNTANT',
  'CLEANER',
  'SECURITY',
  'OTHER',
] as const;
export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED'] as const;

const idSchema = z.string().trim().min(1).max(50);

const dateOnlySchema = (label: string) =>
  z
    .string(`${label}ni kiriting`)
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-09-15')
    .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const employeeListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EMPLOYEE_STATUSES, 'Holat noto‘g‘ri').optional(),
  position: z.enum(EMPLOYEE_POSITIONS, 'Lavozim noto‘g‘ri').optional(),
});

const employeeFields = {
  firstName: nameSchema('Ism'),
  lastName: nameSchema('Familiya'),
  phone: optionalField(phoneSchema),
  position: z.enum(EMPLOYEE_POSITIONS, 'Lavozimni tanlang'),
  baseSalary: z.coerce
    .number('Maosh raqam bo‘lishi kerak')
    .int('Maosh butun son bo‘lishi kerak')
    .min(0, 'Maosh manfiy bo‘lmasligi kerak')
    .max(999_999_999, 'Maosh juda katta'),
  hireDate: dateOnlySchema('Ishga kirgan sana'),
  status: z.enum(EMPLOYEE_STATUSES, 'Holat noto‘g‘ri'),
  terminationDate: optionalField(dateOnlySchema('Ishdan ketgan sana')),
  note: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  /** Tizim akkaunti (bildirishnoma uchun) — ixtiyoriy */
  userId: optionalField(idSchema),
};

export const createEmployeeSchema = z.object({ ...employeeFields, status: employeeFields.status.default('ACTIVE') });

export const updateEmployeeSchema = z
  .object(employeeFields)
  .partial()
  .refine((values) => Object.values(values).some((value) => value !== undefined), 'Kamida bitta maydonni o‘zgartiring');

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
