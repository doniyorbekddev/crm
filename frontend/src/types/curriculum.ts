export type TopicProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface CurriculumTopic {
  id: string;
  title: string;
  description: string | null;
  lessonCount: number;
  sortOrder: number;
  isActive: boolean;
  /** Shu mavzuni tugatgan o‘quvchilar soni */
  completedCount?: number;
}

export interface CurriculumModule {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  topics: CurriculumTopic[];
}

export interface Curriculum {
  courseId: string;
  courseName: string;
  modules: CurriculumModule[];
  totalTopics: number;
  totalLessons: number;
}

export interface TopicProgress {
  topicId: string;
  topicTitle: string;
  moduleTitle: string;
  status: TopicProgressStatus;
  completedAt: string | null;
}

export interface StudentCurriculumProgress {
  courseId: string;
  courseName: string;
  percent: number;
  completed: number;
  total: number;
  modules: Array<{ id: string; title: string; percent: number; completed: number; total: number; topics: TopicProgress[] }>;
}
