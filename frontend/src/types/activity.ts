export type ActivityType = 'student' | 'payment' | 'expense' | 'lead' | 'attendance' | 'teaching' | 'salary';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  occurredAt: string;
  title: string;
  description: string;
  /** Chiqim manfiy */
  amount: number | null;
  tone: 'positive' | 'negative' | 'neutral';
  actor: { id: string; firstName: string; lastName: string } | null;
  link: string | null;
}

export interface ActivityFeed {
  items: ActivityItem[];
  nextCursor: string | null;
  types: ActivityType[];
}

export interface ActivityParams {
  types?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}
