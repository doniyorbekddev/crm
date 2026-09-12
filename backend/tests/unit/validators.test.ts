import { describe, expect, it } from 'vitest';
import { markAttendanceSchema } from '../../src/validators/attendance.validator.js';
import { normalizePhone, paginationQuerySchema, phoneSchema } from '../../src/validators/common.validator.js';
import { createGroupSchema } from '../../src/validators/group.validator.js';
import { createPaymentSchema, debtListQuerySchema, deletePaymentSchema } from '../../src/validators/payment.validator.js';
import { reportQuerySchema } from '../../src/validators/report.validator.js';
import { createStudentSchema } from '../../src/validators/student.validator.js';

describe('telefon raqami', () => {
  it('turli formatlarni bitta ko‘rinishga keltiradi', () => {
    expect(normalizePhone('+998 90 123 45 67')).toBe('+998901234567');
    expect(normalizePhone('998-90-123-45-67')).toBe('+998901234567');
    // 9 raqamli mahalliy raqamga +998 qo‘shiladi
    expect(normalizePhone('901234567')).toBe('+998901234567');
  });

  it('qisqa yoki harfli raqamni rad etadi', () => {
    expect(phoneSchema.safeParse('+998901234567').success).toBe(true);
    expect(phoneSchema.safeParse('123').success).toBe(false);
    expect(phoneSchema.safeParse('telefon').success).toBe(false);
  });
});

describe('sahifalash so‘rovi', () => {
  it('standart qiymatlarni qo‘yadi va matnli sonni o‘giradi', () => {
    expect(paginationQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20, sortOrder: 'desc' });
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it('chegaradan chiqqan qiymatlarni rad etadi', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ sortOrder: 'random' }).success).toBe(false);
  });

  it('bo‘sh qidiruv matnini undefined ga aylantiradi', () => {
    expect(paginationQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
    expect(paginationQuerySchema.parse({ search: ' Ali ' }).search).toBe('Ali');
  });
});

describe('o‘quvchi sxemasi', () => {
  const valid = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '+998901234567',
    courseId: 'course-1',
    startDate: '2026-10-01',
  };

  it('to‘g‘ri ma’lumotni qabul qiladi va sanani Date ga o‘giradi', () => {
    const parsed = createStudentSchema.parse(valid);
    expect(parsed.startDate).toBeInstanceOf(Date);
    expect(parsed.startDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('bo‘sh ixtiyoriy maydonlarni undefined qiladi', () => {
    const parsed = createStudentSchema.parse({ ...valid, telegram: '', email: '', groupId: '' });
    expect(parsed.telegram).toBeUndefined();
    expect(parsed.email).toBeUndefined();
    expect(parsed.groupId).toBeUndefined();
  });

  it('majburiy maydonlar va sana formatini tekshiradi', () => {
    expect(createStudentSchema.safeParse({ ...valid, firstName: 'A' }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...valid, courseId: '' }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...valid, startDate: '01.10.2026' }).success).toBe(false);
  });

  it('shartnoma narxi butun va manfiy bo‘lmasligini talab qiladi', () => {
    expect(createStudentSchema.parse({ ...valid, contractPrice: '1500000' }).contractPrice).toBe(1_500_000);
    expect(createStudentSchema.safeParse({ ...valid, contractPrice: -1 }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...valid, contractPrice: 1.5 }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...valid, contractPrice: 1_000_000_000 }).success).toBe(false);
  });
});

describe('guruh sxemasi', () => {
  const valid = {
    name: 'FE-01',
    courseId: 'course-1',
    startDate: '2026-10-01',
    scheduleDays: ['MONDAY', 'WEDNESDAY'],
    startTime: '14:00',
    endTime: '16:00',
    capacity: 12,
    status: 'ACTIVE',
  };

  it('dars vaqti formatini tekshiradi', () => {
    expect(createGroupSchema.safeParse(valid).success).toBe(true);
    expect(createGroupSchema.safeParse({ ...valid, startTime: '9:00' }).success).toBe(false);
    expect(createGroupSchema.safeParse({ ...valid, endTime: '25:00' }).success).toBe(false);
  });

  it('tugash vaqti boshlanishdan keyin bo‘lishini talab qiladi', () => {
    const result = createGroupSchema.safeParse({ ...valid, startTime: '16:00', endTime: '14:00' });
    expect(result.success).toBe(false);
  });

  it('kamida bitta dars kuni bo‘lishini talab qiladi', () => {
    expect(createGroupSchema.safeParse({ ...valid, scheduleDays: [] }).success).toBe(false);
  });
});

describe('to‘lov sxemalari', () => {
  it('eng kam summa 1 000 so‘m', () => {
    const base = { studentId: 'student-1', method: 'CASH' };
    expect(createPaymentSchema.safeParse({ ...base, amount: 1000 }).success).toBe(true);
    expect(createPaymentSchema.safeParse({ ...base, amount: 999 }).success).toBe(false);
    expect(createPaymentSchema.safeParse({ ...base, amount: 1000.5 }).success).toBe(false);
  });

  it('to‘lov usulini tekshiradi', () => {
    const base = { studentId: 'student-1', amount: 100_000 };
    expect(createPaymentSchema.safeParse({ ...base, method: 'PAYME' }).success).toBe(true);
    expect(createPaymentSchema.safeParse({ ...base, method: 'BITCOIN' }).success).toBe(false);
  });

  it('bekor qilish sababi kamida 5 belgidan iborat', () => {
    expect(deletePaymentSchema.safeParse({ reason: 'Ikki marta kiritilgan' }).success).toBe(true);
    expect(deletePaymentSchema.safeParse({ reason: 'xato' }).success).toBe(false);
    expect(deletePaymentSchema.safeParse({}).success).toBe(false);
  });

  it('qarz oralig‘i standart "all" bo‘ladi', () => {
    expect(debtListQuerySchema.parse({}).range).toBe('all');
    expect(debtListQuerySchema.parse({ range: '1m-plus' }).range).toBe('1m-plus');
    expect(debtListQuerySchema.safeParse({ range: '2m-plus' }).success).toBe(false);
  });
});

describe('hisobot so‘rovi', () => {
  it('standart guruhlash — kunlik', () => {
    expect(reportQuerySchema.parse({}).groupBy).toBe('day');
  });

  it('teskari sana oralig‘ini rad etadi', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-30' }).success).toBe(true);
    expect(reportQuerySchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success).toBe(false);
    // Bir xil sana — bir kunlik hisobot
    expect(reportQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-01' }).success).toBe(true);
  });
});

describe('davomat sxemasi', () => {
  it('holatlarni va ro‘yxat hajmini tekshiradi', () => {
    const base = { date: '2026-09-14' };
    expect(markAttendanceSchema.safeParse({ ...base, records: [{ studentId: 's1', status: 'PRESENT' }] }).success).toBe(true);
    expect(markAttendanceSchema.safeParse({ ...base, records: [] }).success).toBe(false);
    expect(markAttendanceSchema.safeParse({ ...base, records: [{ studentId: 's1', status: 'MAYBE' }] }).success).toBe(false);
  });

  it('bo‘sh izohni undefined qiladi', () => {
    const parsed = markAttendanceSchema.parse({
      date: '2026-09-14',
      records: [{ studentId: 's1', status: 'LATE', note: '   ' }],
    });
    expect(parsed.records[0]?.note).toBeUndefined();
  });
});
