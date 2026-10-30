import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/services/staffAttendance/summary.js';
import { evaluateRow } from '../../src/services/staffAttendance/common.js';
import {
  atBusinessTime,
  availableActions,
  buildDayPlan,
  evaluateDay,
  foldEvents,
  NO_EXCUSE,
  transitionError,
  weekDayOf,
} from '../../src/utils/staffAttendance.js';
import type { DayFacts, ScheduleVersion } from '../../src/utils/staffAttendance.js';

const FIXED: ScheduleVersion = {
  mode: 'FIXED',
  workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  graceMinutes: 10,
  absentAfterMinutes: 120,
  lessonLeadMinutes: 15,
};
const FRIDAY = '2026-10-30';
const SATURDAY = '2026-10-31';
const t = (time: string, date = FRIDAY) => atBusinessTime(date, time);
const plan = (date = FRIDAY, schedule: ScheduleVersion | null = FIXED) => buildDayPlan(date, { schedule, holiday: null, exception: null, lessons: [] });
const facts = (overrides: Partial<DayFacts>): DayFacts => ({ phase: 'WORKING', checkInAt: null, checkOutAt: null, breakSeconds: 0, breakStartedAt: null, ...overrides });

describe('Xodim davomati: vaqt mintaqasi', () => {
  it('jadval vaqti Toshkent vaqti (UTC+5) bo‘yicha talqin qilinadi', () => {
    expect(t('09:00').toISOString()).toBe('2026-10-30T04:00:00.000Z');
    // Toshkentda yarim tundan keyin — UTC bo'yicha hali kechagi kun
    expect(atBusinessTime(FRIDAY, '00:30').toISOString()).toBe('2026-10-29T19:30:00.000Z');
    expect(weekDayOf(FRIDAY)).toBe('FRIDAY');
  });
});

describe('Xodim davomati: holatlar', () => {
  it('o‘z vaqtida, imtiyoz ichida va kechikkan kelish', () => {
    const now = t('12:00');
    const base = { date: FRIDAY, today: FRIDAY, now, plan: plan(), excuse: NO_EXCUSE };
    expect(evaluateDay({ ...base, facts: facts({ checkInAt: t('08:55') }) })).toMatchObject({ status: 'WORKING', arrival: 'PRESENT', lateMinutes: 0 });
    expect(evaluateDay({ ...base, facts: facts({ checkInAt: t('09:10') }) })).toMatchObject({ arrival: 'PRESENT', lateMinutes: 0 });
    // Imtiyozdan o'tdi — kechikish boshlanish vaqtidan hisoblanadi
    expect(evaluateDay({ ...base, facts: facts({ checkInAt: t('09:11') }) })).toMatchObject({ arrival: 'LATE', lateMinutes: 11 });
  });

  it('ish vaqti tanaffussiz; erta ketish va yakunlangan kun', () => {
    const day = evaluateDay({
      date: FRIDAY,
      today: FRIDAY,
      now: t('19:00'),
      plan: plan(),
      excuse: NO_EXCUSE,
      facts: facts({ phase: 'CHECKED_OUT', checkInAt: t('09:00'), checkOutAt: t('17:30'), breakSeconds: 45 * 60 }),
    });
    expect(day).toMatchObject({ status: 'EARLY_DEPARTURE', earlyMinutes: 30, workedSeconds: (8 * 60 + 30 - 45) * 60, scheduledSeconds: 8 * 3600 });

    const full = evaluateDay({
      date: FRIDAY,
      today: FRIDAY,
      now: t('19:00'),
      plan: plan(),
      excuse: NO_EXCUSE,
      facts: facts({ phase: 'CHECKED_OUT', checkInAt: t('09:30'), checkOutAt: t('18:05') }),
    });
    expect(full).toMatchObject({ status: 'LATE', arrival: 'LATE', lateMinutes: 30, earlyMinutes: 0 });
  });

  it('baholash muddatidan oldin "kelmagan" deyilmaydi', () => {
    const base = { date: FRIDAY, today: FRIDAY, plan: plan(), excuse: NO_EXCUSE, facts: null };
    expect(evaluateDay({ ...base, now: t('08:00') }).status).toBe('NOT_YET');
    expect(evaluateDay({ ...base, now: t('10:59') }).status).toBe('NOT_YET');
    expect(evaluateDay({ ...base, now: t('11:00') }).status).toBe('ABSENT');
    expect(evaluateDay({ ...base, now: t('11:00'), excuse: { ...NO_EXCUSE, fullDay: true, label: 'Kasal' } }).status).toBe('EXCUSED');
  });

  it('dam olish kuni, bayram va jadvalsiz xodim — kutilmaydi', () => {
    const now = t('12:00', SATURDAY);
    expect(evaluateDay({ date: SATURDAY, today: SATURDAY, now, plan: plan(SATURDAY), excuse: NO_EXCUSE, facts: null })).toMatchObject({ status: 'OFF', expected: false });
    const holiday = buildDayPlan(FRIDAY, { schedule: FIXED, holiday: 'Mustaqillik kuni', exception: null, lessons: [] });
    expect(holiday).toMatchObject({ kind: 'HOLIDAY', note: 'Mustaqillik kuni' });
    expect(evaluateDay({ date: FRIDAY, today: FRIDAY, now: t('12:00'), plan: holiday, excuse: NO_EXCUSE, facts: null }).status).toBe('OFF');
    expect(evaluateDay({ date: FRIDAY, today: FRIDAY, now: t('12:00'), plan: plan(FRIDAY, null), excuse: NO_EXCUSE, facts: null }).status).toBe('OFF');
  });

  it('chiqish belgilanmagan o‘tgan kun — tekshiruvga, ish vaqti o‘ylab topilmaydi', () => {
    const day = evaluateDay({
      date: FRIDAY,
      today: SATURDAY,
      now: t('09:00', SATURDAY),
      plan: plan(),
      excuse: NO_EXCUSE,
      facts: facts({ checkInAt: t('09:00') }),
    });
    expect(day).toMatchObject({ status: 'PENDING_REVIEW', workedSeconds: null, reviewReason: 'Ishdan ketish belgilanmagan' });
  });

  it('ruxsat: shu vaqtgacha kech kelish va shu vaqtdan erta ketish kechikish hisoblanmaydi', () => {
    const day = evaluateDay({
      date: FRIDAY,
      today: FRIDAY,
      now: t('19:00'),
      plan: plan(),
      excuse: { fullDay: false, lateUntil: '11:00', earlyFrom: '16:00', label: 'Shifokor' },
      facts: facts({ phase: 'CHECKED_OUT', checkInAt: t('10:40'), checkOutAt: t('16:30') }),
    });
    expect(day).toMatchObject({ status: 'COMPLETED', lateMinutes: 0, earlyMinutes: 0 });
  });
});

describe('Xodim davomati: turli jadvallar', () => {
  it('istisno jadvaldan ustun: boshqa soat yoki dam olish', () => {
    const custom = buildDayPlan(FRIDAY, { schedule: FIXED, holiday: null, exception: { type: 'CUSTOM_HOURS', startTime: '13:00', endTime: '20:00', reason: 'Tadbir' }, lessons: [] });
    expect(custom).toMatchObject({ kind: 'WORK', source: 'EXCEPTION', startTime: '13:00', endTime: '20:00' });
    const off = buildDayPlan(FRIDAY, { schedule: FIXED, holiday: null, exception: { type: 'DAY_OFF', startTime: null, endTime: null, reason: 'Almashtirilgan kun' }, lessons: [] });
    expect(off.kind).toBe('OFF');
  });

  it('o‘qituvchi dars jadvali bo‘yicha: birinchi darsdan oldin kelishi, darssiz kun — dam olish', () => {
    const lessons: ScheduleVersion = { ...FIXED, mode: 'LESSONS', workDays: [], startTime: null, endTime: null, breakMinutes: 0 };
    const day = buildDayPlan(FRIDAY, {
      schedule: lessons,
      holiday: null,
      exception: null,
      lessons: [
        { groupName: 'Python-2', startTime: '16:00', endTime: '17:30' },
        { groupName: 'Frontend-1', startTime: '14:00', endTime: '15:30' },
      ],
    });
    expect(day).toMatchObject({ kind: 'WORK', source: 'LESSONS', startTime: '13:45', endTime: '17:30' });
    // 09:00 dagi administratordan farqli — 13:50 da kelgan o'qituvchi kechikmagan
    const evaluation = evaluateDay({ date: FRIDAY, today: FRIDAY, now: t('14:00'), plan: day, excuse: NO_EXCUSE, facts: facts({ checkInAt: t('13:50') }) });
    expect(evaluation).toMatchObject({ arrival: 'PRESENT', lateMinutes: 0 });
    expect(buildDayPlan(SATURDAY, { schedule: lessons, holiday: null, exception: null, lessons: [] }).kind).toBe('OFF');
  });
});

describe('Xodim davomati: amallar ketma-ketligi', () => {
  it('holatga qarab ruxsat etilgan amallar', () => {
    expect(availableActions(null)).toEqual(['CHECK_IN']);
    expect(availableActions('WORKING')).toEqual(['BREAK_START', 'CHECK_OUT']);
    expect(availableActions('ON_BREAK')).toEqual(['BREAK_END']);
    expect(availableActions('CHECKED_OUT')).toEqual([]);
    expect(transitionError('WORKING', 'CHECK_IN')).toMatch(/allaqachon/);
    expect(transitionError(null, 'CHECK_OUT')).toMatch(/Avval ishga kelganingizni/);
    expect(transitionError('CHECKED_OUT', 'CHECK_OUT')).toMatch(/yakunlangan/);
  });

  it('hodisalardan kun yig‘iladi; buzilgan ketma-ketlik rad etiladi', () => {
    const ok = foldEvents([
      { type: 'CHECK_OUT', occurredAt: t('18:00') },
      { type: 'CHECK_IN', occurredAt: t('09:00') },
      { type: 'BREAK_START', occurredAt: t('13:00') },
      { type: 'BREAK_END', occurredAt: t('13:40') },
    ]);
    expect(ok.error).toBeNull();
    expect(ok.facts).toMatchObject({ phase: 'CHECKED_OUT', breakSeconds: 40 * 60 });
    expect(foldEvents([{ type: 'BREAK_START', occurredAt: t('09:00') }]).error).toMatch(/ketma-ketligi/);
    expect(foldEvents([{ type: 'CHECK_IN', occurredAt: t('09:00') }, { type: 'CHECK_IN', occurredAt: t('09:05') }]).error).toBeTruthy();
  });

  it('jami: sababli kunlar foizdan chiqariladi, tugallanmagan kun ish vaqtiga qo‘shilmaydi', () => {
    const row = (date: string, overrides: Partial<{ checkInAt: Date; checkOutAt: Date; phase: 'WORKING' | 'CHECKED_OUT' }>) => ({
      id: date,
      userId: 'u',
      date: new Date(`${date}T00:00:00Z`),
      phase: overrides.phase ?? null,
      checkInAt: overrides.checkInAt ?? null,
      checkOutAt: overrides.checkOutAt ?? null,
      breakSeconds: 0,
      breakStartedAt: null,
      _count: { corrections: 0 },
    });
    const now = t('12:00', '2026-10-30');
    const day = (date: string, value: ReturnType<typeof row> | null, excused = false) =>
      evaluateRow({ userId: 'u', date, today: '2026-10-30', now, plan: plan(date), excuse: excused ? { ...NO_EXCUSE, fullDay: true, label: 'Ta’til' } : NO_EXCUSE, row: value });
    const summary = summarize([
      day('2026-10-26', row('2026-10-26', { phase: 'CHECKED_OUT', checkInAt: t('09:00', '2026-10-26'), checkOutAt: t('18:00', '2026-10-26') })),
      day('2026-10-27', row('2026-10-27', { phase: 'WORKING', checkInAt: t('09:20', '2026-10-27') })),
      day('2026-10-28', null),
      day('2026-10-29', null, true),
    ]);
    expect(summary).toMatchObject({ expectedDays: 4, attendedDays: 2, absentDays: 1, excusedDays: 1, reviewDays: 1, lateDays: 1, workedSeconds: 9 * 3600 });
    expect(summary.attendancePercent).toBeCloseTo(66.7, 1);
  });
});
