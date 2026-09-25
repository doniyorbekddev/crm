import { Download, ExternalLink, FileText, Link2, PlayCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LessonMaterial } from '@/types/lesson';
import { formatFileSize, youtubeEmbedUrl } from '@/utils/lessonLabels';

/** Video: YouTube bo‘lsa sahifa ichida, boshqa manba — yangi oynada havola */
export function LessonVideo({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url);
  if (!embed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
        <PlayCircle className="size-4" aria-hidden />
        Videoni ochish
      </a>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <iframe
        src={embed}
        title={title}
        className="size-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        // Sayt `no-referrer` ishlatadi; YouTube pleyeri esa manbani talab qiladi
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/** Dars matni — oddiy matn, paragraf va qator bo‘linishi saqlanadi (HTML render qilinmaydi) */
export function LessonContent({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-fg">
      {content.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

const ICONS = { FILE: FileText, LINK: Link2, VIDEO: PlayCircle } as const;

/** Materiallar ro‘yxati: fayl — yuklab olish tugmasi, havola/video — yangi oynada */
export function MaterialList({
  materials,
  onDownload,
  renderAction,
}: {
  materials: LessonMaterial[];
  onDownload: (material: LessonMaterial) => void;
  renderAction?: (material: LessonMaterial) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {materials.map((material) => {
        const Icon = ICONS[material.kind];
        return (
          <li key={material.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm text-fg">{material.title}</span>
                {material.kind === 'FILE' && material.size !== null && <span className="text-xs text-fg-subtle">{formatFileSize(material.size)}</span>}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {material.kind === 'FILE' ? (
                <button
                  type="button"
                  onClick={() => onDownload(material)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-surface-muted dark:text-brand-300"
                >
                  <Download className="size-3.5" aria-hidden />
                  Yuklab olish
                </button>
              ) : (
                <a
                  href={material.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-surface-muted dark:text-brand-300"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  Ochish
                </a>
              )}
              {renderAction?.(material)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
