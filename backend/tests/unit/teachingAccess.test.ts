import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../src/config/permissions.js';
import { isRosterLimited, teachingAccessFrom, teachingGroupFilter } from '../../src/services/teachingAccess.js';

/**
 * Egalik qoidalari bitta modulda (TZ 3.0 §0.2 "duplicate business logic qilma"). Ikki qoida ataylab
 * farqli — shu test ularning chegarasini qayd etadi.
 */
const teacher = new Set<string>([PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.STUDENT_VIEW, PERMISSIONS.GROUP_VIEW]);
const accountant = new Set<string>([PERMISSIONS.STUDENT_VIEW, PERMISSIONS.PAYMENT_VIEW]);
const admin = new Set<string>([PERMISSIONS.GROUP_MANAGE, PERMISSIONS.STUDENT_MANAGE, PERMISSIONS.ATTENDANCE_MARK]);

describe('teachingAccess', () => {
  it('ro‘yxat doirasi: faqat o‘qituvchi cheklanadi (buxgalter to‘lov uchun hammani ko‘radi)', () => {
    expect(isRosterLimited(teacher, PERMISSIONS.STUDENT_MANAGE)).toBe(true);
    expect(isRosterLimited(teacher, PERMISSIONS.GROUP_MANAGE)).toBe(true);
    expect(isRosterLimited(accountant, PERMISSIONS.STUDENT_MANAGE)).toBe(false);
    expect(isRosterLimited(admin, PERMISSIONS.GROUP_MANAGE)).toBe(false);
  });

  it('akademik doira qat’iyroq: group.manage bo‘lmagan har kim — faqat o‘z guruhlari', () => {
    expect(teachingGroupFilter(teachingAccessFrom(teacher, 'u1'))).toEqual({ group: { teacherId: 'u1' } });
    expect(teachingGroupFilter(teachingAccessFrom(accountant, 'u2'))).toEqual({ group: { teacherId: 'u2' } });
    expect(teachingGroupFilter(teachingAccessFrom(admin, 'u3'))).toEqual({});
  });
});
