import type { BadgeTone } from '@/components/ui/Badge';
import type { LessonMaterialKind, LessonStatus } from '@/types/lesson';

export const LESSON_STATUS_ORDER: readonly LessonStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  DRAFT: 'Qoralama',
  PUBLISHED: 'Nashr qilingan',
  ARCHIVED: 'Arxiv',
};

export const LESSON_STATUS_TONES: Record<LessonStatus, BadgeTone> = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'yellow',
};

export const MATERIAL_KIND_LABELS: Record<LessonMaterialKind, string> = {
  FILE: 'Fayl',
  LINK: 'Havola',
  VIDEO: 'Video',
};

/**
 * YouTube havolasidan embed manzili (`youtube-nocookie`). Boshqa manba — null (havola sifatida ochiladi).
 * Faqat ma'lum formatlar: watch?v=, youtu.be/, embed/, shorts/.
 */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = parsed.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
      else {
        const match = /^\/(embed|shorts|live)\/([^/?#]+)/.exec(parsed.pathname);
        id = match?.[2] ?? null;
      }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

/** 1 536 → "1,5 KB" */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
