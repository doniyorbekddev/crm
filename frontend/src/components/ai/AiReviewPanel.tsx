import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { aiAcademicService } from '@/services/aiAcademic.service';
import { AiSourceBadge, InsightList } from './InsightList';

interface AiReviewPanelProps {
  homeworkId: string;
  studentId: string;
  maxPoints: number;
  /** O'qituvchi izohi — "Qabul qilish" bilan birga yuboriladi */
  feedback: string;
  /** "Ballni tahrirlash": taklif balli baholash formasiga qo'yiladi */
  onUseScore: (score: number) => void;
  onAccepted: () => void;
}

const CRITERIA_LABELS: Record<string, string> = { correctness: 'To‘g‘rilik', completeness: 'To‘liqlik', quality: 'Sifat', understanding: 'Tushunish' };

/**
 * AI vazifa tekshiruvi (TZ §34–36): mezonlar, xatolar, tavsiyalar, taklif balli va o'xshashlik
 * signali. Yakuniy qaror o'qituvchida: Qabul qilish / Ballni tahrirlash / Qaytarish (oyna tugmasi).
 */
export function AiReviewPanel({ homeworkId, studentId, maxPoints, feedback, onUseScore, onAccepted }: AiReviewPanelProps) {
  const queryClient = useQueryClient();
  const key = queryKeys.aiAcademic.review(homeworkId, studentId);
  const latest = useQuery({ queryKey: key, queryFn: () => aiAcademicService.latestReview(homeworkId, studentId) });
  const run = useMutation({
    mutationFn: () => aiAcademicService.review(homeworkId, studentId),
    onSuccess: (analysis) => queryClient.setQueryData(key, analysis),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const accept = useMutation({
    mutationFn: (analysisId: string) => aiAcademicService.accept(analysisId, feedback.trim() ? { feedback: feedback.trim() } : {}),
    onSuccess: (result) => {
      toast.success(`AI taklifi qabul qilindi: ${String(result.data.decision?.score ?? '')} ball`);
      void queryClient.invalidateQueries({ queryKey: key });
      onAccepted();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const analysis = latest.data;
  const result = analysis?.result;

  return (
    <section aria-label="AI tekshiruv" className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Bot className="size-4" aria-hidden /> AI tekshiruv
          {analysis && <AiSourceBadge source={analysis.source} model={analysis.model} />}
        </h3>
        <Button variant="secondary" loading={run.isPending} onClick={() => run.mutate()}>
          {analysis ? 'Qayta tekshirish' : 'AI bilan tekshirish'}
        </Button>
      </div>

      {analysis && result && (
        <>
          <p className="text-sm text-fg">{analysis.summary}</p>
          {result.criteria && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(result.criteria).map(([criterion, value]) => (
                <div key={criterion} className="rounded-md bg-surface-muted px-2 py-1">
                  <dt className="text-xs text-fg-muted">{CRITERIA_LABELS[criterion] ?? criterion}</dt>
                  <dd className="font-medium tabular-nums text-fg">{value}%</dd>
                </div>
              ))}
            </dl>
          )}
          {result.similarity.length > 0 && (
            <Alert tone="warning" title="O‘xshashlik signali">
              {result.similarity.map((row) => `${row.studentName}: ${row.sameLink ? 'bir xil havola' : `${row.score}%`}`).join('; ')}. Bu hukm emas — o‘qituvchi tekshiradi.
            </Alert>
          )}
          <InsightList items={result.items.filter((item) => !item.text.startsWith('Yuqori o‘xshashlik') && !item.text.startsWith('Bir xil havola'))} />
          {result.filesNote && <p className="text-xs text-fg-subtle">{result.filesNote}</p>}

          {analysis.status === 'ACCEPTED' ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">Qabul qilingan: {String(analysis.decision?.score ?? '')} ball</p>
          ) : result.suggestedScore !== null ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-sm text-fg">
                AI taklif balli: <b className="tabular-nums">{result.suggestedScore}/{maxPoints}</b>
              </span>
              <Button leftIcon={<Check className="size-4" aria-hidden />} loading={accept.isPending} onClick={() => accept.mutate(analysis.id)}>
                Qabul qilish
              </Button>
              <Button variant="secondary" leftIcon={<PencilLine className="size-4" aria-hidden />} onClick={() => onUseScore(result.suggestedScore!)}>
                Ballni tahrirlash
              </Button>
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">Ball taklif qilinmadi — ballni o‘zingiz qo‘ying.</p>
          )}
        </>
      )}
    </section>
  );
}
