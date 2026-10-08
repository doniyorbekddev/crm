export type MyWorkSectionKey = 'tasks' | 'followUps' | 'approvals' | 'alerts' | 'homework' | 'examReviews' | 'attendance' | 'feedback';

export interface MyWorkItem {
  id: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  overdue: boolean;
  link: string | null;
}

export interface MyWorkSection {
  key: MyWorkSectionKey;
  title: string;
  count: number;
  overdue: number;
  link: string;
  items: MyWorkItem[];
}

export interface MyWork {
  total: number;
  overdue: number;
  sections: MyWorkSection[];
}
