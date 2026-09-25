import { z } from 'zod';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

const dateOnlySchema = z
  .string('Sanani kiriting')
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const attendanceQuerySchema = z.object({
  date: dateOnlySchema,
});

export const markAttendanceSchema = z.object({
  date: dateOnlySchema,
  /** Shu darsda o'tilgan kurs mavzusi (ixtiyoriy) — kelganlar progressi yangilanadi */
  topicId: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.string().trim().min(1).max(50).optional()),
  records: z
    .array(
      z.object({
        studentId: z.string().trim().min(1).max(50),
        status: z.enum(ATTENDANCE_STATUSES, 'Davomat holati noto‘g‘ri'),
        note: z
          .string()
          .trim()
          .max(255, 'Izoh 255 belgidan oshmasligi kerak')
          .optional()
          .transform((value) => (value && value.length > 0 ? value : undefined)),
      }),
      'Davomat ro‘yxati noto‘g‘ri',
    )
    .min(1, 'Kamida bitta o‘quvchi belgilanishi kerak')
    .max(200, 'Juda ko‘p yozuv'),
});

export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
