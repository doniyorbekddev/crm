import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, ImageIcon, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/api';
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, documentsService } from '@/services/documents.service';
import type { DocumentItem, DocumentOwner } from '@/types/document';
import { formatDateTime } from '@/utils/format';

interface AttachmentsModalProps {
  owner: DocumentOwner;
  entityId: string;
  title: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Xarajat / tushum cheklari: yuklash, yuklab olish, o‘chirish */
export function AttachmentsModal({ owner, entityId, title, canManage, onClose, onChanged }: AttachmentsModalProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const queryKey = ['documents', owner, entityId] as const;

  const query = useQuery({ queryKey, queryFn: () => documentsService.list(owner, entityId) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    onChanged();
  };

  const upload = useMutation({
    mutationFn: (file: File) => documentsService.upload(owner, entityId, file),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  const remove = useMutation({
    mutationFn: (document: DocumentItem) => documentsService.remove(document.id),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Fayl hajmi 5 MB dan oshmasligi kerak');
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
    <Modal open title="Cheklar va hujjatlar" description={title} onClose={onClose} closeDisabled={upload.isPending}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4 text-center">
            <p className="text-sm text-fg-muted">JPG, PNG, WEBP yoki PDF · 5 MB gacha</p>
            <input ref={inputRef} type="file" accept={ACCEPTED_UPLOAD_TYPES} className="hidden" onChange={onFile} aria-label="Chek faylini tanlash" />
            <div>
              <Button leftIcon={<Upload className="size-4" aria-hidden />} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
                Fayl yuklash
              </Button>
            </div>
          </div>
        )}

        {query.isPending ? (
          <p className="py-4 text-center text-sm text-fg-muted">Yuklanmoqda…</p>
        ) : query.isError ? (
          <Alert tone="error">{getErrorMessage(query.error)}</Alert>
        ) : query.data.length === 0 ? (
          <p className="py-4 text-center text-sm text-fg-muted">Hali chek biriktirilmagan</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {query.data.map((document) => {
              const Icon = document.mimeType === 'application/pdf' ? FileText : ImageIcon;
              return (
                <li key={document.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <Icon className="size-5 shrink-0 text-fg-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{document.originalName}</p>
                    <p className="text-xs text-fg-muted">
                      {formatSize(document.size)} · {formatDateTime(document.createdAt)}
                      {document.uploadedBy && ` · ${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${document.originalName} faylini yuklab olish`}
                    loading={downloading === document.id}
                    onClick={() => void download(document)}
                  >
                    <Download className="size-4" aria-hidden />
                  </Button>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${document.originalName} faylini o‘chirish`}
                      loading={remove.isPending && remove.variables?.id === document.id}
                      onClick={() => remove.mutate(document)}
                    >
                      <Trash2 className="size-4 text-red-600 dark:text-red-400" aria-hidden />
                    </Button>
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
