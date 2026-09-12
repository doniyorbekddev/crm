import type { BadgeTone } from '@/components/ui/Badge';
import type { CourseCategory, CourseStatus } from '@/types/course';
import type { GroupStatus, WeekDay } from '@/types/group';

export const COURSE_CATEGORY_ORDER: readonly CourseCategory[] = [
  'PROGRAMMING',
  'LANGUAGE',
  'DESIGN',
  'COMPUTER_LITERACY',
  'SCHOOL_PREPARATION',
  'OTHER',
];

export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  PROGRAMMING: 'Dasturlash',
  LANGUAGE: 'Chet tili',
  DESIGN: 'Dizayn',
  COMPUTER_LITERACY: 'Kompyuter savodxonligi',
  SCHOOL_PREPARATION: 'Maktabga tayyorlov',
  OTHER: 'Boshqa',
};

export const COURSE_STATUS_ORDER: readonly CourseStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  ACTIVE: 'Faol',
  INACTIVE: 'Nofaol',
  ARCHIVED: 'Arxivlangan',
};

export const COURSE_STATUS_TONES: Record<CourseStatus, BadgeTone> = {
  ACTIVE: 'green',
  INACTIVE: 'gray',
  ARCHIVED: 'yellow',
};

export const GROUP_STATUS_ORDER: readonly GroupStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

export const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  PLANNED: 'Rejalashtirilgan',
  ACTIVE: 'Faol',
  COMPLETED: 'Tugagan',
  CANCELLED: 'Bekor qilingan',
};

export const GROUP_STATUS_TONES: Record<GroupStatus, BadgeTone> = {
  PLANNED: 'blue',
  ACTIVE: 'green',
  COMPLETED: 'gray',
  CANCELLED: 'red',
};

export const WEEK_DAY_ORDER: readonly WeekDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

export const WEEK_DAY_SHORT_LABELS: Record<WeekDay, string> = {
  MONDAY: 'Du',
  TUESDAY: 'Se',
  WEDNESDAY: 'Ch',
  THURSDAY: 'Pa',
  FRIDAY: 'Ju',
  SATURDAY: 'Sh',
  SUNDAY: 'Ya',
};

export function sortWeekDays(days: readonly WeekDay[]): WeekDay[] {
  return [...days].sort((a, b) => WEEK_DAY_ORDER.indexOf(a) - WEEK_DAY_ORDER.indexOf(b));
}

/** ["MONDAY","WEDNESDAY"] + 14:00–16:00 → "Du, Ch · 14:00–16:00" */
export function formatSchedule(days: readonly WeekDay[], startTime: string, endTime: string): string {
  const shortDays = sortWeekDays(days).map((day) => WEEK_DAY_SHORT_LABELS[day]);
  return `${shortDays.join(', ')} · ${startTime}–${endTime}`;
}
