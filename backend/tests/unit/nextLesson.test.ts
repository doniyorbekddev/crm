import { describe, expect, it } from 'vitest';
import { nextLessonFor } from '../../src/services/studentProgress.service.js';

/** Markaz vaqti UTC+5: 2026-10-05 (dushanba) 15:00 mahalliy = 10:00 UTC */
const MONDAY_15 = new Date('2026-10-05T10:00:00.000Z');

const group = {
  name: 'FE-01',
  status: 'ACTIVE',
  scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
  startTime: '14:00',
  endTime: '16:00',
  startDate: new Date('2026-08-01'),
  endDate: null as Date | null,
  room: '101',
};

describe('nextLessonFor', () => {
  it('bugungi dars boshlangan bo‘lsa — keyingi dars kuni', () => {
    expect(nextLessonFor(group, MONDAY_15)).toEqual({ date: '2026-10-07', startTime: '14:00', endTime: '16:00', groupName: 'FE-01', room: '101' });
  });

  it('bugungi dars hali boshlanmagan bo‘lsa — bugun', () => {
    expect(nextLessonFor({ ...group, startTime: '18:00', endTime: '20:00' }, MONDAY_15)?.date).toBe('2026-10-05');
  });

  it('kun markaz vaqti bo‘yicha: UTC da hali yakshanba, markazda dushanba', () => {
    // 2026-10-04 20:00 UTC = 2026-10-05 01:00 mahalliy
    expect(nextLessonFor(group, new Date('2026-10-04T20:00:00.000Z'))?.date).toBe('2026-10-05');
  });

  it('guruh hali boshlanmagan bo‘lsa — boshlanish sanasidan keyingi birinchi dars', () => {
    expect(nextLessonFor({ ...group, status: 'PLANNED', startDate: new Date('2026-10-08') }, MONDAY_15)?.date).toBe('2026-10-09');
  });

  it('tugagan, bekor qilingan yoki jadvalsiz guruh — null', () => {
    expect(nextLessonFor({ ...group, status: 'COMPLETED' }, MONDAY_15)).toBeNull();
    expect(nextLessonFor({ ...group, endDate: new Date('2026-10-06') }, MONDAY_15)).toBeNull();
    expect(nextLessonFor({ ...group, scheduleDays: [] }, MONDAY_15)).toBeNull();
  });
});
