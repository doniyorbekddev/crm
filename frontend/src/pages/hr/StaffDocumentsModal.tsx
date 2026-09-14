import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, ImageIcon, Pencil, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, documentsService } from '@/services/documents.service';
import type { DocumentItem, StaffDocumentCategory } from '@/types/document';
import { DOCUMENT_CATEGORY_LABELS, STAFF_DOCUMENT_CATEGORY_ORDER, documentExpiryState } from '@/utils/documentLabels';
import { formatDate, formatDateTime } from '@/utils/format';

interface StaffDocumentsModalProps {
  owner: 'teacher' | 'employee';
  entityId: string;
  personName: string;
  canManage: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

interface MetaDraft {
  category: StaffDocumentCategory;
  title: string;
  expiresAt: string;
}

const EMPTY_DRAFT: MetaDraft = { category: 'CONTRACT', title: '', expiresAt: '' };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MetaFields({ idPrefix, draft, errors, onChange }: { idPrefix: string; draft: MetaDraft; errors: Record<string, string>; onChange: (draft: MetaDraft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <FormField label="Turi" htmlFor={`${idPrefix}-category`} error={errors.category} required>
        <Select id={`${idPrefix}-category`} value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value as StaffDocumentCategory })}>
          {STAFF_DOCUMENT_CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>
              {DOCUMENT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Nomi" htmlFor={`${idPrefix}-title`} error={errors.title} hint="ixtiyoriy">
        <Input id={`${idPrefix}-title`} value={draft.title} maxLength={150} placeholder="Mehnat shartnomasi 2026" onChange={(event) => onChange({ ...draft, title: event.target.value })} />
      </FormField>
      <FormField label="Amal qilish muddati" htmlFor={`${idPrefix}-expiresAt`} error={errors.expiresAt} hint="ixtiyoriy">
        <Input id={`${idPrefix}-expiresAt`} type="date" value={draft.expiresAt} onChange={(event) => onChange({ ...draft, expiresAt: event.target.value })} />
      </FormField>
    </div>
  );
}

/** O‘qituvchi / xodim hujjatlari: shartnoma, pasport nusxasi, sertifikat. Ochiq havola yo‘q — yuklab olish ruxsat bilan */
export function StaffDocumentsModal({ owner, entityId, personName, canManage, onClose, onChanged }: StaffDocumentsModalProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<MetaDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: MetaDraft } | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const queryKey = ['documents', owner, entityId] as const;

  const query = useQuery({ queryKey, queryFn: () => documentsService.list(owner, entityId) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    onChanged?.();
  };

  const collectErrors = (error: unknown, setter: (value: Record<string, string>) => void, fallback: (message: string) => void) => {
    const fields = getFieldErrors(error);
    if (fields.length > 0) setter(Object.fromEntries(fields.map((field) => [field.field, field.message])));
    else fallback(getErrorMessage(error));
  };

  const upload = useMutation({
    mutationFn: (file: File) =>
      documentsService.upload(owner, entityId, file, {
        category: draft.category,
        ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
        ...(draft.expiresAt ? { expiresAt: draft.expiresAt } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setDraft(EMPTY_DRAFT);
      setErrors({});
      refresh();
    },
    onError: (error) => collectErrors(error, setErrors, setUploadError),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; draft: MetaDraft }) =>
      documentsService.update(input.id, { category: input.draft.category, title: input.draft.title.trim(), expiresAt: input.draft.expiresAt }),
    onSuccess: (result) => {
      toast.success(result.message);
      setEditing(null);
      setEditErrors({});
      refresh();
    },
    onError: (error) => collectErrors(error, setEditErrors, (message) => toast.error(message)),
  });

  const remove = useMutation({
    mutationFn: (document: DocumentItem) => documentsService.remove(document.id),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError(null);
    setErrors({});
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Fayl hajmi 5 MB dan oshmasligi kerak');
      return;
    }
    upload.mutate(file);
  };

  const download = async (document: DocumentItem) => {
    setDownloading(document.id);
    try {
      await documentsService.download(document);
    } catch (downloadError) {
      toast.error(getErrorMessage(downloadError));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Modal open size="lg" title="Hujjatlar" description={personName} onClose={onClose} closeDisabled={upload.isPending}>
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs text-fg-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Fayllarga ochiq havola berilmaydi — faqat hujjatlarni ko‘rish ruxsati bor xodimlar yuklab oladi. Har bir amal auditga yoziladi.
        </p>

        {canManage && (
          <section className="space-y-3 rounded-xl border border-dashed border-border p-3">
            {uploadError && <Alert tone="error">{uploadError}</Alert>}
            <MetaFields idPrefix="new-document" draft={draft} errors={errors} onChange={setDraft} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-fg-muted">JPG, PNG, WEBP yoki PDF · 5 MB gacha</p>
              <input ref={inputRef} type="file" accept={ACCEPTED_UPLOAD_TYPES} className="hidden" onChange={onFile} aria-label="Hujjat faylini tanlash" />
              <Button leftIcon={<Upload className="size-4" aria-hidden />} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
                Fayl tanlab yuklash
              </Button>
            </div>
          </section>
        )}

        {query.isPending ? (
          <p className="py-4 text-center text-sm text-fg-muted">Yuklanmoqda…</p>
        ) : query.isError ? (
          <Alert tone="error">{getErrorMessage(query.error)}</Alert>
        ) : query.data.length === 0 ? (
          <p className="rounded-xl border border-border py-6 text-center text-sm text-fg-muted">Hali hujjat biriktirilmagan</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {query.data.map((document) => {
              const Icon = document.mimeType === 'application/pdf' ? FileText : ImageIcon;
              const expiry = documentExpiryState(document.expiresAt);
              const isEditing = editing?.id === document.id;
              return (
                <li key={document.id} className="px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <Icon className="size-5 shrink-0 text-fg-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="blue">{DOCUMENT_CATEGORY_LABELS[document.category]}</Badge>
                        {expiry && <Badge tone={expiry.tone}>{expiry.label}</Badge>}
                      </p>
                      <p className="mt-1 truncate font-medium text-fg">{document.title ?? document.originalName}</p>
                      <p className="text-xs text-fg-muted">
                        {document.title && `${document.originalName} · `}
                        {formatSize(document.size)} · {formatDateTime(document.createdAt)}
                        {document.uploadedBy && ` · ${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`}
                        {document.expiresAt && ` · muddati ${formatDate(document.expiresAt)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button size="sm" variant="ghost" aria-label={`${document.originalName} faylini yuklab olish`} loading={downloading === document.id} onClick={() => void download(document)}>
                        <Download className="size-4" aria-hidden />
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${document.originalName} ma’lumotlarini tahrirlash`}
                            onClick={() => {
                              setEditErrors({});
                              setEditing(
                                isEditing
                                  ? null
                                  : {
                                      id: document.id,
                                      draft: {
                                        category: document.category === 'RECEIPT' ? 'OTHER' : document.category,
                                        title: document.title ?? '',
                                        expiresAt: document.expiresAt ?? '',
                                      },
                                    },
                              );
                            }}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${document.originalName} faylini o‘chirish`}
                            loading={remove.isPending && remove.variables?.id === document.id}
                            onClick={() => remove.mutate(document)}
                          >
                            <Trash2 className="size-4 text-red-600 dark:text-red-400" aria-hidden />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing && editing && (
                    <div className="mt-3 space-y-3 rounded-lg bg-surface-muted p-3">
                      <MetaFields idPrefix={`edit-${document.id}`} draft={editing.draft} errors={editErrors} onChange={(next) => setEditing({ id: document.id, draft: next })} />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)} disabled={update.isPending}>
                          Bekor qilish
                        </Button>
                        <Button size="sm" loading={update.isPending} onClick={() => update.mutate(editing)}>
                          Saqlash
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
