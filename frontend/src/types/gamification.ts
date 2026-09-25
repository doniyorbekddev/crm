export type XpSource =
  | 'ATTENDANCE'
  | 'HOMEWORK'
  | 'EXAM'
  | 'STREAK'
  | 'REFERRAL'
  | 'COURSE_COMPLETED'
  | 'BADGE'
  | 'MANUAL';

export type BadgeRule =
  | 'MANUAL'
  | 'STREAK_DAYS'
  | 'ATTENDANCE_RATE'
  | 'HOMEWORK_COUNT'
  | 'EXAM_SCORE'
  | 'XP_TOTAL'
  | 'COURSE_COMPLETED'
  | 'REFERRAL';

export type BadgeCategory = 'ATTENDANCE' | 'ACADEMIC' | 'ACTIVITY' | 'SOCIAL' | 'SPECIAL';

export type LeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

export interface GamificationProfile {
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  totalXp: number;
  level: { number: number; name: string; icon: string | null; minXp: number };
  nextLevel: { number: number; name: string; minXp: number; xpLeft: number } | null;
  progress: number;
  rank: number | null;
  streak: { current: number; longest: number; lastAttendanceDate: string | null };
  badges: Array<{ id: string; key: string; name: string; icon: string; description: string; awardedAt: string }>;
  recentXp: Array<{ id: string; points: number; source: XpSource; description: string; createdAt: string }>;
}

export interface LeaderboardParams {
  period?: LeaderboardPeriod;
  courseId?: string;
  groupId?: string;
  limit?: number;
}

export interface LeaderboardRow {
  rank: number;
  studentId: string;
  code: string;
  firstName: string;
  lastName: string;
  courseName: string;
  groupName: string | null;
  xp: number;
  totalXp: number;
  levelNumber: number;
  levelName: string;
  badges: number;
  streak: number;
}

export interface XpRule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  source: XpSource;
  points: number;
  isActive: boolean;
}

export interface Level {
  id: string;
  number: number;
  name: string;
  minXp: number;
  icon: string | null;
  color: string | null;
  students: number;
}

export interface Badge {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  rule: BadgeRule;
  category: BadgeCategory;
  threshold: number | null;
  xpReward: number;
  isActive: boolean;
  awarded: number;
}

export interface CreateBadgePayload {
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  rule: BadgeRule;
  threshold?: number;
  xpReward: number;
  isActive: boolean;
}

export interface ManualXpPayload {
  studentId: string;
  points: number;
  description: string;
}
