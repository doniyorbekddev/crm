import { UploadCloud } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { cn } from '@/lib/cn';

interface FileUploadProps {
  /** Tanlangan (va tekshiruvdan o'tgan) fayllar. Yuklash va ro'yxatni chaqiruvchi boshqaradi. */
  onFiles: (files: File[]) => void;
  /** Rad etilgan fayl sababi (hajm yoki tur) — chaqiruvchi ko'rsatadi (toast yoki maydon xatosi) */
  onReject?: (message: string) => void;
  id?: string;
  title?: string;
  /** Qabul qilinadigan turlar va chegara izohi: "PDF, JPG, PNG — 10 MB gacha" */
  hint?: string;
  /** `<input accept>` bilan bir xil: ".pdf,image/*" */
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

function matchesAccept(file: File, accept: string): boolean {
  return accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) =>
      rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule) : rule.endsWith('/*') ? file.type.toLowerCase().startsWith(rule.slice(0, -1)) : file.type.toLowerCase() === rule,
    );
}

const megabytes = (bytes: number) => `${Math.round((bytes / 1_048_576) * 10) / 10} MB`;

/**
 * Fayl tanlash: bosish, klaviatura (Tab → Enter/bo'sh joy) yoki sudrab tashlash.
 * Bu yerdagi tekshiruv faqat qulaylik uchun — haqiqiy tur va hajm nazorati serverda.
 */
export function FileUpload({
  onFiles,
  onReject,
  id,
  title = 'Faylni tanlang yoki shu yerga tashlang',
  hint,
  accept,
  multiple = false,
  maxSizeBytes,
  disabled = false,
  invalid = false,
  className,
}: FileUploadProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accepted = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const ok: File[] = [];
    for (const file of multiple ? files : files.slice(0, 1)) {
      if (accept && !matchesAccept(file, accept)) onReject?.(`“${file.name}” — bu turdagi fayl qabul qilinmaydi`);
      else if (maxSizeBytes && file.size > maxSizeBytes) onReject?.(`“${file.name}” — hajmi ${megabytes(maxSizeBytes)} dan oshmasin`);
      else ok.push(file);
    }
    if (ok.length > 0) onFiles(ok);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accepted(event.dataTransfer.files);
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center transition-colors',
        'hover:border-fg-subtle hover:bg-surface-muted has-focus-visible:border-brand-500 has-focus-visible:ring-3 has-focus-visible:ring-brand-500/20',
        dragging && 'border-brand-500 bg-primary-subtle',
        invalid && 'border-danger-solid',
        disabled && 'pointer-events-none cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => {
          accepted(event.target.files);
          // Xuddi shu faylni qayta tanlash mumkin bo'lsin
          event.target.value = '';
        }}
      />
      <span className="grid size-9 place-items-center rounded-control bg-surface-muted text-fg-muted">
        <UploadCloud className="size-5" aria-hidden />
      </span>
      <span className="text-body font-medium text-fg">{title}</span>
      {hint && (
        <span id={hintId} className="text-caption text-fg-muted">
          {hint}
        </span>
      )}
    </label>
  );
}
