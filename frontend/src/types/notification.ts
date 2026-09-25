export type NotificationType =
  | 'NEW_LEAD'
  | 'LEAD_ASSIGNED'
  | 'NEW_PAYMENT'
  | 'FOLLOW_UP_REMINDER'
  | 'FOLLOW_UP_OVERDUE'
  | 'NEW_STUDENT'
  | 'DEBT_REMINDER'
  | 'TRIAL_LESSON_REMINDER'
  | 'EXPENSE_APPROVAL'
  | 'DAILY_DIGEST'
  | 'CHILD_ABSENT'
  | 'PAYMENT_DUE_SOON'
  | 'NEGATIVE_FEEDBACK'
  | 'HOMEWORK_CREATED'
  | 'HOMEWORK_GRADED'
  | 'EXAM_RESULT'
  | 'LEVEL_UP'
  | 'CERTIFICATE_ISSUED'
  | 'WEEKLY_REPORT'
  | 'HOMEWORK_DEADLINE'
  | 'HOMEWORK_RETURNED'
  | 'EXAM_SCHEDULED'
  | 'LOW_SCORE'
  | 'ATTENDANCE_LATE'
  | 'RISK_INCREASED'
  | 'SYSTEM';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListParams {
  page: number;
  limit: number;
  type?: NotificationType;
  priority?: NotificationPriority;
  unreadOnly?: 'true' | 'false';
}

export interface NotificationSetting {
  type: NotificationType;
  inApp: boolean;
  telegram: boolean;
  priority: NotificationPriority;
  /** `false` — o‘chirib bo‘lmaydigan tur (tizim xabarlari) */
  canMute: boolean;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  byType: Array<{ type: NotificationType; unread: number }>;
  /** Muhim va o‘qilmaganlar */
  unreadHigh: number;
}
