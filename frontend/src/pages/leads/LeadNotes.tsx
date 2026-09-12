import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import { formatDateTime } from '@/utils/format';

interface LeadNotesProps {
  leadId: string;
  canAdd: boolean;
  /** `lead.delete` — boshqalarning izohini ham o‘chira oladi */
  canDeleteAny: boolean;
  currentUserId: string;
}

export function LeadNotes({ leadId, canAdd, canDeleteAny, currentUserId }: LeadNotesProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const notesQuery = useQuery({ queryKey: queryKeys.leads.notes(leadId), queryFn: () => leadsService.notes(leadId) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.notes(leadId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.activities(leadId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.detail(leadId) });
  };

  const addNote = useMutation({
    mutationFn: (text: string) => leadsService.addNote(leadId, text),
    onSuccess: () => {
      setContent('');
      toast.success('Izoh qo‘shildi');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => leadsService.deleteNote(leadId, noteId),
    onSuccess: (message) => {
      toast.success(message);
      setDeletingId(null);
      refresh();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setDeletingId(null);
    },
  });

  const trimmed = content.trim();

  return (
    <div className="space-y-5 p-5">
      {canAdd && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) addNote.mutate(trimmed);
          }}
          className="space-y-2"
        >
          <label htmlFor="lead-note" className="sr-only">
            Yangi izoh
          </label>
          <Textarea
            id="lead-note"
            value={content}
            maxLength={2000}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Mijoz bilan suhbat natijasi, kelishuvlar, muhim tafsilotlar..."
            className="min-h-20"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-fg-subtle">{content.length} / 2000</span>
            <Button type="submit" size="sm" disabled={!trimmed} loading={addNote.isPending}>
              Izoh qo‘shish
            </Button>
          </div>
        </form>
      )}

      {notesQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : notesQuery.isError ? (
        <ErrorState error={notesQuery.error} onRetry={() => void notesQuery.refetch()} />
      ) : notesQuery.data.length === 0 ? (
        <EmptyState icon={StickyNote} title="Izohlar yo‘q" description={canAdd ? 'Birinchi izohni yozing' : undefined} />
      ) : (
        <ul className="space-y-3">
          {notesQuery.data.map((note) => {
            const canDelete = canDeleteAny || note.author?.id === currentUserId;
            return (
              <li key={note.id} className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {note.author && <Avatar firstName={note.author.firstName} lastName={note.author.lastName} size="xs" />}
                    <p className="truncate text-xs text-fg-muted">
                      <span className="font-medium text-fg">{note.author ? `${note.author.firstName} ${note.author.lastName}` : 'Noma’lum'}</span>
                      {' · '}
                      {formatDateTime(note.createdAt)}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeletingId(note.id)}
                      aria-label="Izohni o‘chirish"
                      className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{note.content}</p>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        title="Izoh o‘chirilsinmi?"
        description="Izoh butunlay o‘chiriladi."
        confirmLabel="O‘chirish"
        loading={deleteNote.isPending}
        onConfirm={() => deletingId && deleteNote.mutate(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
