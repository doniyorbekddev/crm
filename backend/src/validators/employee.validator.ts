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
  department: optionalField(z.string().trim().max(100)),
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
  email: optionalField(z.email('Email noto‘g‘ri formatda').max(255)),
  department: optionalField(z.string().trim().max(100, 'Bo‘lim nomi juda uzun')),
  // Mehnat shartnomasi
  contractNumber: optionalField(z.string().trim().max(50, 'Shartnoma raqami juda uzun')),
  contractStartDate: optionalField(dateOnlySchema('Shartnoma boshlangan sana')),
  contractEndDate: optionalField(dateOnlySchema('Shartnoma tugash sanasi')),
  // Maxfiy ma'lumot — faqat `employee.sensitive` ruxsati bilan ko'rinadi
  birthDate: optionalField(dateOnlySchema('Tug‘ilgan sana')),
  address: optionalField(z.string().trim().max(255, 'Manzil juda uzun')),
  passportNumber: optionalField(z.string().trim().max(32, 'Pasport raqami juda uzun')),
  emergencyContact: optionalField(z.string().trim().max(120, 'Juda uzun')),
  emergencyPhone: optionalField(phoneSchema),
};

export const LEAVE_TYPES = ['VACATION', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER'] as const;
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export const createLeaveSchema = z
  .object({
    employeeId: idSchema,
    type: z.enum(LEAVE_TYPES, 'Ta’til turini tanlang'),
    startDate: dateOnlySchema('Boshlanish sanasi'),
    endDate: dateOnlySchema('Tugash sanasi'),
    reason: optionalField(z.string().trim().max(255, 'Sabab juda uzun')),
  })
  .refine((values) => values.endDate >= values.startDate, {
    path: ['endDate'],
    message: 'Tugash sanasi boshlanishdan keyin bo‘lsin',
  });

export const decideLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED'], 'Qaror noto‘g‘ri'),
  note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

export const leaveListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  employeeId: optionalField(idSchema),
  status: z.enum(LEAVE_STATUSES).optional(),
  type: z.enum(LEAVE_TYPES).optional(),
});

export const createEmployeeSchema = z.object({ ...employeeFields, status: employeeFields.status.default('ACTIVE') });

export const updateEmployeeSchema = z
  .object(employeeFields)
  .partial()
  .refine((values) => Object.values(values).some((value) => value !== undefined), 'Kamida bitta maydonni o‘zgartiring');

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
