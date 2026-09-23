import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/cn';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { feedbackService } from '@/services/feedback.service';
import type { FeedbackType } from '@/types/feedback';

const TYPE_LABELS: Record<Exclude<FeedbackType, 'NPS'>, string> = {
  TEACHER: 'O‘qituvchi',
  COURSE: 'Kurs',
  ACADEMY: 'Markaz',
};

/**
 * Kabinetdagi fikr formasi. O'quvchi ID si yuborilmaydi — backend hisobga bog'langan
 * o'quvchini o'zi aniqlaydi. Bir kunda bir turdagi fikr bir marta qoldiriladi.
 */
export function FeedbackCard({ studentId }: { studentId?: string }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<FeedbackType>('TEACHER');
  const [rating, setRating] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const stateQuery = useQuery({
    queryKey: queryKeys.feedback.portal(studentId),
    queryFn: () => feedbackService.portalState(studentId),
  });

  const submit = useMutation({
    mutationFn: () =>
      feedbackService.portalSubmit(
        {
          type,
          ...(type === 'NPS' ? { npsScore: nps ?? 0 } : { rating }),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          isAnonymous: anonymous,
        },
        studentId,
      ),
    onSuccess: (result) => {
      toast.success(result.message);
      setRating(0);
      setNps(null);
      setComment('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.feedback.portal(studentId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const answered = stateQuery.data?.answeredToday ?? [];
  const alreadyAnswered = answered.includes(type);
  const canSubmit = !alreadyAnswered && (type === 'NPS' ? nps !== null : rating > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fikringiz</CardTitle>
        <span className="text-xs text-fg-muted">javobingiz markazga yordam beradi</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={type} onChange={(event) => setType(event.target.value as FeedbackType)} aria-label="Nima haqida">
          {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((key) => (
            <option key={key} value={key}>
              {TYPE_LABELS[key]}
            </option>
          ))}
          <option value="NPS">Do‘stingizga tavsiya qilasizmi?</option>
        </Select>

        {alreadyAnswered ? (
          <p className="text-sm text-fg-muted">Bugun bu bo‘yicha fikringizni qoldirdingiz. Rahmat!</p>
        ) : type === 'NPS' ? (
          <div>
            <p className="mb-1.5 text-sm text-fg-muted">0 — tavsiya qilmayman, 10 — albatta tavsiya qilaman</p>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 11 }, (_, index) => index).map((score) => (
                <button
                  key={score}
                  type="button"
                  aria-pressed={nps === score}
                  onClick={() => setNps(score)}
                  className={cn(
                    'size-9 rounded-lg border text-sm tabular-nums transition-colors',
                    nps === score ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200' : 'border-border text-fg-muted hover:bg-surface-muted',
                  )}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1" role="group" aria-label="Baho">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" aria-label={`${star} yulduz`} aria-pressed={rating === star} onClick={() => setRating(star)}>
                <Star className={cn('size-7 transition-colors', star <= rating ? 'fill-amber-400 text-amber-400' : 'text-border hover:text-amber-300')} aria-hidden />
              </button>
            ))}
          </div>
        )}

        {!alreadyAnswered && (
          <>
            <Textarea
              className="min-h-20"
              value={comment}
              placeholder="Xohlasangiz izoh qoldiring"
              onChange={(event) => setComment(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <Checkbox checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
              Anonim yuborilsin (ismim ko‘rinmasin)
            </label>
            <Button disabled={!canSubmit} loading={submit.isPending} onClick={() => submit.mutate()}>
              Yuborish
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
