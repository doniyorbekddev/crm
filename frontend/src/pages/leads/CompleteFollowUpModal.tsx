import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { followUpsService } from '@/services/followUps.service';
import type { FollowUpItem } from '@/types/followUp';
import { fromDateTimeInputValue } from '@/utils/format';

interface CompleteFollowUpModalProps {
  followUp: FollowUpItem;
  onClose: () => void;
  onDone: () => void;
}

export function CompleteFollowUpModal({ followUp, onClose, onDone }: CompleteFollowUpModalProps) {
  const [comment, setComment] = useState('');
  const [createNext, setCreateNext] = useState(false);
  const [nextTitle, setNextTitle] = useState(followUp.title);
  const [nextDueAt, setNextDueAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const complete = useMutation({
    mutationFn: () => {
      const nextIso = createNext ? fromDateTimeInputValue(nextDueAt) : undefined;
      return followUpsService.complete(followUp.id, {
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(nextIso ? { nextDueAt: nextIso, ...(nextTitle.trim() ? { nextTitle: nextTitle.trim() } : {}) } : {}),
      });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onDone();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const nextInvalid = createNext && !nextDueAt;

  return (
    <Modal
      open
      size="sm"
      title="Follow-up bajarildi"
      description={followUp.title}
      onClose={onClose}
      closeDisabled={complete.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={complete.isPending}>
            Bekor qilish
          </Button>
          <Button
            leftIcon={<CheckCircle2 className="size-4" aria-hidden />}
            loading={complete.isPending}
            disabled={nextInvalid}
            onClick={() => {
              setFormError(null);
              complete.mutate();
            }}
          >
            Bajarildi
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <div className="space-y-4">
        <FormField label="Natija" htmlFor="complete-comment" hint="Timeline’ga yoziladi">
          <Textarea
            id="complete-comment"
            value={comment}
            maxLength={500}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Masalan: gaplashdik, ertaga javob beradi"
            className="min-h-20"
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-fg">
          <Checkbox checked={createNext} onChange={(event) => setCreateNext(event.target.checked)} />
          Keyingi follow-up yaratilsin
        </label>

        {createNext && (
          <div className="space-y-3 rounded-lg border border-border bg-surface-muted/40 p-3">
            <FormField label="Keyingi vazifa" htmlFor="complete-next-title">
              <Input id="complete-next-title" value={nextTitle} onChange={(event) => setNextTitle(event.target.value)} />
            </FormField>
            <FormField label="Muddat" htmlFor="complete-next-due" required>
              <Input
                id="complete-next-due"
                type="datetime-local"
                value={nextDueAt}
                invalid={nextInvalid}
                onChange={(event) => setNextDueAt(event.target.value)}
              />
            </FormField>
          </div>
        )}
      </div>
    </Modal>
  );
}
