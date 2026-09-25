import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Paperclip, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MaterialList } from '@/components/lesson/LessonBody';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { lessonsService } from '@/services/lessons.service';
import type { Lesson, LessonStatus } from '@/types/lesson';
import { LESSON_STATUS_LABELS, LESSON_STATUS_ORDER } from '@/utils/lessonLabels';

interface LessonEditorModalProps {
  /** Yangi dars — mavzu; tahrirlash — dars id */
  target: { mode: 'create'; topicId: string; topicTitle: string } | { mode: 'edit'; lessonId: string };
  onClose: () => void;
}

interface Draft {
  title: string;
  description: string;
  content: string;
  durationMinutes: string;
  videoUrl: string;
  status: LessonStatus;
}

function draftFrom(lesson: Lesson | undefined): Draft {
  return {
    title: lesson?.title ?? '',
    description: lesson?.description ?? '',
    content: lesson?.content ?? '',
    durationMinutes: lesson?.durationMinutes ? String(lesson.durationMinutes) : '',
    videoUrl: lesson?.videoUrl ?? '',
    status: lesson?.status ?? 'DRAFT',
  };
}

/**
 * Dars muharriri (TZ §14): nom, tavsif, konspekt, davomiylik, video, holat va materiallar.
 * Materiallar dars saqlangandan keyin qo‘shiladi (fayl darsga bog‘lanishi kerak).
 */
export function LessonEditorModal({ target, onClose }: LessonEditorModalProps) {
  const queryClient = useQueryClient();
  const [lessonId, setLessonId] = useState(target.mode === 'edit' ? target.lessonId : null);
  const [changes, setChanges] = useState<Partial<Draft>>({});
  const [linkForm, setLinkForm] = useState({ kind: 'LINK' as 'LINK' | 'VIDEO', title: '', url: '' });
  const [fileTitle, setFileTitle] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const lessonQuery = useQuery({
    queryKey: queryKeys.lessons.detail(lessonId ?? ''),
    queryFn: () => lessonsService.get(lessonId!),
    enabled: Boolean(lessonId),
  });
  // Server holati ustiga faqat o‘zgartirilgan maydonlar qo‘yiladi — forma qayta yuklanishda eskirmaydi
  const draft: Draft = { ...draftFrom(lessonQuery.data), ...changes };
  const set = (patch: Partial<Draft>) => setChanges((current) => ({ ...current, ...patch }));

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        content: draft.content.trim() || null,
        durationMinutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,
        videoUrl: draft.videoUrl.trim() || null,
        status: draft.status,
      };
      return lessonId ? lessonsService.update(lessonId, payload) : lessonsService.create((target as { topicId: string }).topicId, payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setFormError(null);
      setChanges({});
      setLessonId(result.data.id);
      queryClient.setQueryData(queryKeys.lessons.detail(result.data.id), result.data);
      refresh();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const addLink = useMutation({
    mutationFn: () => lessonsService.addLink(lessonId!, { kind: linkForm.kind, title: linkForm.title.trim(), url: linkForm.url.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      setLinkForm({ kind: 'LINK', title: '', url: '' });
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const upload = useMutation({
    mutationFn: (file: File) => lessonsService.upload(lessonId!, file, fileTitle.trim() || undefined),
    onSuccess: (result) => {
      toast.success(result.message);
      setFileTitle('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeMaterial = useMutation({
    mutationFn: (id: string) => lessonsService.removeMaterial(id),
    onSuccess: (message) => {
      toast.success(message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const title = target.mode === 'create' && !lessonId ? `Yangi dars · ${target.topicTitle}` : 'Darsni tahrirlash';

  return (
    <Modal
      open
      size="lg"
      title={title}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Yopish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={draft.title.trim().length < 2}>
            Saqlash
          </Button>
        </>
      }
    >
      {lessonId && lessonQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <FormField label="Dars nomi" htmlFor="lesson-title" required>
            <Input id="lesson-title" value={draft.title} maxLength={200} onChange={(event) => set({ title: event.target.value })} />
          </FormField>
          <FormField label="Qisqa tavsif" htmlFor="lesson-description">
            <Input id="lesson-description" value={draft.description} maxLength={1000} onChange={(event) => set({ description: event.target.value })} />
          </FormField>
          <FormField label="Dars matni (konspekt)" htmlFor="lesson-content" hint="Bo‘sh qator — yangi paragraf">
            <Textarea id="lesson-content" rows={8} value={draft.content} onChange={(event) => set({ content: event.target.value })} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Davomiyligi (daqiqa)" htmlFor="lesson-duration">
              <Input id="lesson-duration" type="number" min={1} max={600} value={draft.durationMinutes} onChange={(event) => set({ durationMinutes: event.target.value })} />
            </FormField>
            <FormField label="Video havola" htmlFor="lesson-video">
              <Input id="lesson-video" type="url" placeholder="https://youtu.be/…" value={draft.videoUrl} onChange={(event) => set({ videoUrl: event.target.value })} />
            </FormField>
            <FormField label="Holat" htmlFor="lesson-status" hint="O‘quvchi faqat nashr qilinganni ko‘radi">
              <Select id="lesson-status" value={draft.status} onChange={(event) => set({ status: event.target.value as LessonStatus })}>
                {LESSON_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {LESSON_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium text-fg">Materiallar</p>
            {!lessonId ? (
              <p className="text-sm text-fg-muted">Materiallar darsni saqlagandan keyin qo‘shiladi.</p>
            ) : (
              <div className="space-y-3">
                {(lessonQuery.data?.materials.length ?? 0) > 0 && (
                  <MaterialList
                    materials={lessonQuery.data!.materials}
                    onDownload={(material) => void lessonsService.download(material).catch((error: unknown) => toast.error(getErrorMessage(error)))}
                    renderAction={(material) => (
                      <button
                        type="button"
                        aria-label={`${material.title} — o‘chirish`}
                        onClick={() => removeMaterial.mutate(material.id)}
                        className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  />
                )}
                <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
                  <Select aria-label="Material turi" value={linkForm.kind} onChange={(event) => setLinkForm({ ...linkForm, kind: event.target.value as 'LINK' | 'VIDEO' })}>
                    <option value="LINK">Havola</option>
                    <option value="VIDEO">Video</option>
                  </Select>
                  <Input aria-label="Material nomi" placeholder="Nomi" value={linkForm.title} onChange={(event) => setLinkForm({ ...linkForm, title: event.target.value })} />
                  <Input aria-label="Havola" type="url" placeholder="https://…" value={linkForm.url} onChange={(event) => setLinkForm({ ...linkForm, url: event.target.value })} />
                  <Button
                    variant="secondary"
                    leftIcon={<Link2 className="size-4" aria-hidden />}
                    loading={addLink.isPending}
                    disabled={linkForm.title.trim().length < 2 || !linkForm.url.trim()}
                    onClick={() => addLink.mutate()}
                  >
                    Qo‘shish
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input aria-label="Fayl nomi (ixtiyoriy)" placeholder="Fayl nomi (ixtiyoriy)" value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} />
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-muted">
                    {upload.isPending ? <Upload className="size-4 animate-pulse" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
                    Fayl yuklash (PDF, rasm)
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={upload.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload.mutate(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-fg-subtle">Slayd, arxiv va boshqa formatlarni Google Drive havolasi sifatida qo‘shing.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
