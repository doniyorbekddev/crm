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
  | 'SYSTEM';

export interface NotificationItem {
  id: string;
  type: NotificationType;
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
  unreadOnly?: 'true' | 'false';
}

export interface NotificationSummary {
  total: number;
  unread: number;
  byType: Array<{ type: NotificationType; unread: number }>;
}
