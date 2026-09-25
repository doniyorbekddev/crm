import { describe, expect, it } from 'vitest';
import { LESSON_STATUS_LABELS, LESSON_STATUS_ORDER, formatFileSize, youtubeEmbedUrl } from './lessonLabels';

describe('lessonLabels', () => {
  it('har bir holat uchun yorliq bor', () => {
    for (const status of LESSON_STATUS_ORDER) expect(LESSON_STATUS_LABELS[status]).toBeTruthy();
  });

  it('YouTube havolalarini xavfsiz embed manziliga aylantiradi, boshqasini emas', () => {
    const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe(embed);
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://vimeo.com/123')).toBeNull();
    expect(youtubeEmbedUrl('https://youtube.com.evil.uz/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeEmbedUrl('https://youtu.be/"><script>')).toBeNull();
    expect(youtubeEmbedUrl('not a url')).toBeNull();
  });

  it('fayl hajmini o‘qiladigan ko‘rinishda beradi', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1,5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(formatFileSize(null)).toBe('');
  });
});
