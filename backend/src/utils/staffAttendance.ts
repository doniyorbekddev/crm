import { businessDayFromString } from './dates.js';

/**
 * Xodim davomati — holat mexanizmi (sof funksiyalar, bazaga murojaat yo'q).
 *
 * Hamma vaqtlar server tomonida hisoblanadi; "HH:mm" jadval vaqtlari o'quv markaz vaqt mintaqasida
 * (Asia/Tashkent, `APP_UTC_OFFSET_MINUTES`) talqin qilinadi va UTC `Date` ga aylantiriladi.
 *
 * Qoidalar:
 *  - kechikish xodimning **o'z jadvali** bo'yicha (umumiy standart yo'q): `kelgan > boshlanish + imtiyoz`;
 *    kechikish daqiqasi boshlanish vaqtidan hisoblanadi;
 *  - ish boshlanishi + `absentAfterMinutes` o'tmaguncha xodim "kelmagan" deb belgilanmaydi;
 *  - chiqish belgilanmagan o'tgan kun — `PENDING_REVIEW`, ish vaqti **o'ylab topilmaydi** (null);
 *  - tanaffus ish vaqtidan ayiriladi.
 */

export type StaffEventType = 'CHECK_IN' | 'BREAK_START' | 'BREAK_END' | 'CHECK_OUT';
export type StaffPhase = 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT';

export type StaffDayStatus =
  | 'WORKING'
  | 'ON_BREAK'
  | 'COMPLETED'
  | 'LATE'
  | 'EARLY_DEPARTURE'
  | 'PENDING_REVIEW'
  | 'ABSENT'
  | 'EXCUSED'
  /** Ish vaqti boshlangan, lekin baholash muddati hali o'tmagan */
  | 'NOT_YET'
  /** Kelish kutilmagan kun (dam olish, bayram, jadval yo'q) */
  | 'OFF';

export type StaffArrival = 'PRESENT' | 'LATE';

const TIME_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const MINUTE_MS = 60_000;

export function parseTime(value: string): number {
  const match = TIME_RE.exec(value);
  if (!match) throw new Error(`Vaqt formati noto'g'ri: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "2026-10-30" + "09:15" → shu paytning UTC vaqti (markaz vaqti bo'yicha) */
export function atBusinessTime(date: string, time: string): Date {
  return new Date(businessDayFromString(date).getTime() + parseTime(time) * MINUTE_MS);
}

/** Bir kunlik reja: kelish kutiladimi va qachon */
export interface DayPlan {
  kind: 'WORK' | 'OFF' | 'HOLIDAY' | 'UNSCHEDULED';
  /** Reja qayerdan olingani */
  source: 'FIXED' | 'LESSONS' | 'EXCEPTION' | null;
  startTime: string | null;
  endTime: string | null;
  plannedBreakMinutes: number;
  graceMinutes: number;
  absentAfterMinutes: number;
  /** Bayram yoki istisno sababi */
  note: string | null;
  /** LESSONS: shu kungi darslar */
  lessons: Array<{ groupName: string; startTime: string; endTime: string }>;
}

export const NO_PLAN: DayPlan = {
  kind: 'UNSCHEDULED',
  source: null,
  startTime: null,
  endTime: null,
  plannedBreakMinutes: 0,
  graceMinutes: 0,
  absentAfterMinutes: 0,
  note: null,
  lessons: [],
};

/** Tasdiqlangan ruxsat (yoki ta'til) — shu kunga ta'siri */
export interface DayExcuse {
  fullDay: boolean;
  /** Shu vaqtgacha kelsa kechikish hisoblanmaydi ("HH:mm") */
  lateUntil: string | null;
  /** Shu vaqtdan keyin ketsa erta ketish hisoblanmaydi ("HH:mm") */
  earlyFrom: string | null;
  label: string | null;
}

export const NO_EXCUSE: DayExcuse = { fullDay: false, lateUntil: null, earlyFrom: null, label: null };

/** Hodisalardan yig'ilgan kun ma'lumoti */
export interface DayFacts {
  phase: StaffPhase | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  /** Yopilgan tanaffuslar, soniya */
  breakSeconds: number;
  breakStartedAt: Date | null;
}

export const EMPTY_FACTS: DayFacts = { phase: null, checkInAt: null, checkOutAt: null, breakSeconds: 0, breakStartedAt: null };

/** Joriy holatda qaysi amallar mumkin */
export function availableActions(phase: StaffPhase | null): StaffEventType[] {
  if (phase === null) return ['CHECK_IN'];
  if (phase === 'WORKING') return ['BREAK_START', 'CHECK_OUT'];
  if (phase === 'ON_BREAK') return ['BREAK_END'];
  return [];
}

/** Amal mumkin bo'lmasa — xodimga tushunarli sabab */
export function transitionError(phase: StaffPhase | null, action: StaffEventType): string | null {
  if (availableActions(phase).includes(action)) return null;
  if (phase === 'CHECKED_OUT') return 'Bugungi ish kuni allaqachon yakunlangan';
  if (action === 'CHECK_IN') return 'Siz bugun ishga kelganingizni allaqachon belgilagansiz';
  if (phase === null) return 'Avval ishga kelganingizni belgilang';
  if (phase === 'ON_BREAK') return action === 'BREAK_START' ? 'Siz allaqachon tanaffusdasiz' : 'Avval tanaffusdan qaytganingizni belgilang';
  return 'Siz tanaffusda emassiz';
}

/**
 * Hodisalarni tartib bilan "o'ynab" kun ma'lumotini yig'adi. Ketma-ketlik buzilgan bo'lsa (tuzatishda
 * noto'g'ri vaqt kiritilganda) — `error` qaytaradi va natija saqlanmaydi.
 */
export function foldEvents(events: ReadonlyArray<{ type: StaffEventType; occurredAt: Date }>): { facts: DayFacts; error: string | null } {
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const facts: DayFacts = { ...EMPTY_FACTS };
  for (const event of sorted) {
    const error = transitionError(facts.phase, event.type);
    if (error) return { facts, error: `Hodisalar ketma-ketligi noto‘g‘ri: ${error.toLowerCase()}` };
    if (event.type === 'CHECK_IN') {
      facts.checkInAt = event.occurredAt;
      facts.phase = 'WORKING';
    } else if (event.type === 'BREAK_START') {
      facts.breakStartedAt = event.occurredAt;
      facts.phase = 'ON_BREAK';
    } else if (event.type === 'BREAK_END') {
      facts.breakSeconds += Math.round((event.occurredAt.getTime() - facts.breakStartedAt!.getTime()) / 1000);
      facts.breakStartedAt = null;
      facts.phase = 'WORKING';
    } else {
      facts.checkOutAt = event.occurredAt;
      facts.phase = 'CHECKED_OUT';
    }
  }
  return { facts, error: null };
}

export interface DayEvaluation {
  status: StaffDayStatus;
  arrival: StaffArrival | null;
  /** Kelish kutilgan kunmi (ish kuni, bayram/dam olish emas) */
  expected: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  /** Rejadagi ish vaqti (tanaffussiz), soniya */
  scheduledSeconds: number;
  /** Haqiqiy ish vaqti (tanaffussiz). Yakunlanmagan kunda — hozirgacha (bugun) yoki null (o'tgan kun) */
  workedSeconds: number | null;
  breakSeconds: number;
  lateMinutes: number;
  earlyMinutes: number;
  excused: boolean;
  reviewReason: string | null;
}

export interface EvaluateInput {
  /** Baholanayotgan sana, "YYYY-MM-DD" (markaz vaqti) */
  date: string;
  /** Bugungi sana (markaz vaqti) */
  today: string;
  now: Date;
  plan: DayPlan;
  facts: DayFacts | null;
  excuse: DayExcuse;
}

const seconds = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE_MS));

export function evaluateDay({ date, today, now, plan, facts, excuse }: EvaluateInput): DayEvaluation {
  const working = plan.kind === 'WORK' && plan.startTime !== null && plan.endTime !== null;
  const start = working ? atBusinessTime(date, plan.startTime!) : null;
  const end = working ? atBusinessTime(date, plan.endTime!) : null;
  const scheduledSeconds = start && end ? Math.max(0, seconds(start, end) - plan.plannedBreakMinutes * 60) : 0;
  const base = {
    expected: working,
    scheduledStart: start,
    scheduledEnd: end,
    scheduledSeconds,
    lateMinutes: 0,
    earlyMinutes: 0,
    excused: excuse.fullDay,
    reviewReason: null as string | null,
  };

  const checkIn = facts?.checkInAt ?? null;
  if (!facts || !checkIn) {
    const none = { ...base, arrival: null, workedSeconds: null, breakSeconds: 0 };
    if (!working) return { ...none, status: excuse.fullDay ? 'EXCUSED' : 'OFF' };
    if (excuse.fullDay) return { ...none, status: 'EXCUSED' };
    if (date > today) return { ...none, status: 'NOT_YET' };
    const deadline = new Date(start!.getTime() + plan.absentAfterMinutes * MINUTE_MS);
    if (date === today && now < deadline) return { ...none, status: 'NOT_YET' };
    return { ...none, status: 'ABSENT' };
  }

  let lateMinutes = 0;
  if (start) {
    const lateFrom = new Date(start.getTime() + plan.graceMinutes * MINUTE_MS);
    const excusedUntil = excuse.lateUntil ? atBusinessTime(date, excuse.lateUntil) : null;
    if (checkIn > lateFrom && !(excusedUntil && checkIn <= excusedUntil)) lateMinutes = minutesBetween(start, checkIn);
  }
  const arrival: StaffArrival = lateMinutes > 0 ? 'LATE' : 'PRESENT';

  const ongoingBreak = facts.breakStartedAt ? seconds(facts.breakStartedAt, facts.checkOutAt ?? now) : 0;
  const breakSeconds = facts.breakSeconds + (facts.phase === 'ON_BREAK' ? ongoingBreak : 0);

  if (facts.checkOutAt) {
    const checkOut = facts.checkOutAt;
    let earlyMinutes = 0;
    if (end && checkOut < end) {
      const excusedFrom = excuse.earlyFrom ? atBusinessTime(date, excuse.earlyFrom) : null;
      if (!(excusedFrom && checkOut >= excusedFrom)) earlyMinutes = minutesBetween(checkOut, end);
    }
    const workedSeconds = Math.max(0, seconds(checkIn, checkOut) - breakSeconds);
    const status: StaffDayStatus = earlyMinutes > 0 ? 'EARLY_DEPARTURE' : lateMinutes > 0 ? 'LATE' : 'COMPLETED';
    return { ...base, status, arrival, workedSeconds, breakSeconds, lateMinutes, earlyMinutes, excused: false };
  }

  // Chiqish belgilanmagan
  if (date < today) {
    return {
      ...base,
      status: 'PENDING_REVIEW',
      arrival,
      workedSeconds: null,
      breakSeconds,
      lateMinutes,
      excused: false,
      reviewReason: 'Ishdan ketish belgilanmagan',
    };
  }
  const workedSoFar = Math.max(0, seconds(checkIn, now) - breakSeconds);
  return {
    ...base,
    status: facts.phase === 'ON_BREAK' ? 'ON_BREAK' : 'WORKING',
    arrival,
    workedSeconds: workedSoFar,
    breakSeconds,
    lateMinutes,
    excused: false,
  };
}

const WEEK_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
export type WeekDayKey = (typeof WEEK_DAYS)[number];

/** "2026-10-30" → 'FRIDAY' */
export function weekDayOf(date: string): WeekDayKey {
  return WEEK_DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** Sana oralig'idagi kunlar ("YYYY-MM-DD", ikkala chekka ham) */
export function eachDate(from: string, to: string): string[] {
  const result: string[] = [];
  for (let cursor = Date.parse(`${from}T00:00:00Z`); cursor <= Date.parse(`${to}T00:00:00Z`); cursor += 86_400_000) {
    result.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return result;
}

export interface ScheduleVersion {
  mode: 'FIXED' | 'LESSONS';
  workDays: readonly string[];
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  graceMinutes: number;
  absentAfterMinutes: number;
  lessonLeadMinutes: number;
}

export interface PlanContext {
  schedule: ScheduleVersion | null;
  holiday: string | null;
  exception: { type: 'DAY_OFF' | 'CUSTOM_HOURS'; startTime: string | null; endTime: string | null; reason: string } | null;
  /** LESSONS rejimi uchun shu kungi darslar */
  lessons: Array<{ groupName: string; startTime: string; endTime: string }>;
}

const minutesToTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

/**
 * Bir kunlik rejani yig'adi. Ustuvorlik: xodimning shu kungi istisnosi → bayram → jadval.
 * LESSONS: boshlanish = birinchi dars − `lessonLeadMinutes`, tugash = oxirgi dars tugashi; dars yo'q kun — dam olish.
 */
export function buildDayPlan(date: string, context: PlanContext): DayPlan {
  const { schedule, holiday, exception } = context;
  const rules = {
    plannedBreakMinutes: schedule?.breakMinutes ?? 0,
    graceMinutes: schedule?.graceMinutes ?? 10,
    absentAfterMinutes: schedule?.absentAfterMinutes ?? 120,
  };

  if (exception) {
    if (exception.type === 'DAY_OFF') return { ...NO_PLAN, kind: 'OFF', source: 'EXCEPTION', note: exception.reason };
    return {
      ...NO_PLAN,
      ...rules,
      kind: 'WORK',
      source: 'EXCEPTION',
      startTime: exception.startTime,
      endTime: exception.endTime,
      note: exception.reason,
    };
  }
  if (holiday) return { ...NO_PLAN, kind: 'HOLIDAY', note: holiday };
  if (!schedule) return NO_PLAN;

  if (schedule.mode === 'LESSONS') {
    const lessons = [...context.lessons].sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (lessons.length === 0) return { ...NO_PLAN, kind: 'OFF', source: 'LESSONS' };
    const first = Math.max(0, parseTime(lessons[0]!.startTime) - schedule.lessonLeadMinutes);
    const last = Math.max(...lessons.map((lesson) => parseTime(lesson.endTime)));
    return {
      ...rules,
      kind: 'WORK',
      source: 'LESSONS',
      startTime: minutesToTime(first),
      endTime: minutesToTime(last),
      note: null,
      lessons,
    };
  }

  if (!schedule.workDays.includes(weekDayOf(date)) || !schedule.startTime || !schedule.endTime) {
    return { ...NO_PLAN, kind: 'OFF', source: 'FIXED' };
  }
  return { ...rules, kind: 'WORK', source: 'FIXED', startTime: schedule.startTime, endTime: schedule.endTime, note: null, lessons: [] };
}
