export type LessonStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type LessonMaterialKind = 'FILE' | 'LINK' | 'VIDEO';

export interface LessonMaterial {
  id: string;
  kind: LessonMaterialKind;
  title: string;
  /** Havola/video uchun; fayl — yuklab olish endpointi orqali */
  url: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  sortOrder: number;
}

export interface Lesson {
  id: string;
  topicId: string;
  title: string;
  description: string | null;
  content: string | null;
  teacher: { id: string; name: string } | null;
  durationMinutes: number | null;
  videoUrl: string | null;
  sortOrder: number;
  status: LessonStatus;
  publishedAt: string | null;
  updatedAt: string;
  materials: LessonMaterial[];
}

export interface PortalLessonDetail extends Lesson {
  completed: boolean;
}

export interface LessonSummary {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  hasVideo: boolean;
  materialCount: number;
  sortOrder: number;
  status: LessonStatus;
  publishedAt: string | null;
  completed?: boolean;
}

export interface LessonTree {
  courseId: string;
  courseName: string;
  canEdit: boolean;
  modules: Array<{ id: string; title: string; topics: Array<{ id: string; title: string; lessons: LessonSummary[] }> }>;
  totals: { lessons: number; published: number; completed?: number };
}

export interface LessonPayload {
  title: string;
  description?: string | null;
  content?: string | null;
  durationMinutes?: number | null;
  videoUrl?: string | null;
  status?: LessonStatus;
  sortOrder?: number;
}
