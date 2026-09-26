export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'WEEKDAYS';
export type WeekDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** Takrorlanuvchi uy vazifasi jadvali (TZ 3.1 GAP-18) */
export interface RecurringHomework {
  id: string;
  group: { id: string; name: string };
  title: string;
  description: string | null;
  maxPoints: number;
  xpReward: number;
  frequency: RecurringFrequency;
  weekdays: WeekDay[];
  startDate: string;
  endDate: string | null;
  publishTime: string;
  deadlineTime: string;
  deadlineOffsetDays: number;
  isActive: boolean;
  generated: number;
  nextOccurrence: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface RecurringHomeworkPayload {
  groupId: string;
  title: string;
  description?: string;
  maxPoints: number;
  frequency: RecurringFrequency;
  weekdays: WeekDay[];
  startDate: string;
  endDate?: string | null;
  publishTime: string;
  deadlineTime: string;
  deadlineOffsetDays: number;
}
