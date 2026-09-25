import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AiSourceBadge, InsightList } from '@/components/ai/InsightList';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { aiAcademicService } from '@/services/aiAcademic.service';
import type { AiAnalysis, RemedialResult } from '@/types/aiAcademic';

const STEP_LABELS: Record<RemedialResult['steps'][number]['kind'], string> = {
  LESSON: 'Dars',
  HOMEWORK: 'Vazifa',
  QUIZ: 'Quiz',
  RETEST: 'Qayta test',
  MASTERY: 'O‘zlashtirish',
};

/** §41: remedial reja — o'qituvchi ko'rib chiqadi va tasdiqlaydi (qoralama vazifa + onlayn quiz) */
function RemedialPlan({ plan, onDone }: { plan: AiAnalysis<RemedialResult>; onDone: () => void }) {
  const [decision, setDecision] = useState<Record<string, unknown> | null>(null);
  const accept = useMutation({
    mutationFn: () => aiAcademicService.accept(plan.id),
    onSuccess: (result) => {
      toast.success('Remedial reja tasdiqlandi — vazifa qoralama sifatida yaratildi');
      setDecision(result.data.decision);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const reject = useMutation({
    mutationFn: () => aiAcademicService.reject(plan.id),
    onSuccess: () => {
      toast.success('Reja rad etildi');
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <section aria-label="Remedial reja" className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900 dark:bg-brand-950/30">
      <h4 className="text-sm font-semibold text-fg">Remedial reja: {plan.result.topic.title}</h4>
      <ol className="space-y-1 text-sm">
        {plan.result.steps.map((step, index) => (
          <li key={step.kind} className="flex gap-2">
            <span className="w-5 shrink-0 text-fg-muted">{index + 1}.</span>
            <span>
              <b className="text-fg">{STEP_LABELS[step.kind]}:</b> {step.title} <span className="text-fg-muted">— {step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      {decision ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Yaratildi: <Link to="/homework" className="underline">qoralama vazifa</Link>
          {decision.examId ? (
            <>
              {' '}va <Link to="/exams" className="underline">onlayn quiz</Link>
            </>
          ) : null}
          . Vazifani tahrirlab e’lon qiling.
        </p>
      ) : (
        <div className="flex gap-2">
          <Button loading={accept.isPending} onClick={() => accept.mutate()}>
            Tasdiqlash
          </Button>
          <Button variant="secondary" loading={reject.isPending} onClick={() => reject.mutate()}>
            Rad etish
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * AI guruh tahlili (TZ §38): kuchli/zaif mavzular, ko'rsatkichlar, tavsiya etilgan amallar;
 * zaif mavzu bo'yicha remedial reja (§41).
 */
export function GroupAiModal({ group, onClose }: { group: { id: string; name: string }; onClose: () => void }) {
  const queryClient = useQueryClient();
  const key = queryKeys.aiAcademic.group(group.id);
  const query = useQuery({ queryKey: key, queryFn: () => aiAcademicService.latestGroup(group.id) });
  const [plan, setPlan] = useState<AiAnalysis<RemedialResult> | null>(null);
  const run = useMutation({
    mutationFn: () => aiAcademicService.analyzeGroup(group.id),
    onSuccess: (analysis) => queryClient.setQueryData(key, analysis),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const propose = useMutation({
    mutationFn: (topicId: string) => aiAcademicService.remedial({ groupId: group.id, topicId }),
    onSuccess: setPlan,
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const analysis = query.data;

  return (
    <Modal
      open
      size="lg"
      title="AI guruh tahlili"
      description={group.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" leftIcon={<Bot className="size-4" aria-hidden />} loading={run.isPending} onClick={() => run.mutate()}>
            {analysis ? 'Yangilash' : 'Tahlil qilish'}
          </Button>
          <Button onClick={onClose}>Yopish</Button>
        </>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !analysis ? (
        <EmptyState icon={Bot} title="Hali tahlil yo‘q" description="“Tahlil qilish” guruh bo‘yicha kuchli va zaif mavzularni, tavsiyalarni tayyorlaydi" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AiSourceBadge source={analysis.source} model={analysis.model} />
          </div>
          <p className="text-sm text-fg">{analysis.summary}</p>
          <InsightList items={analysis.result.items} />
          {analysis.result.actions.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-fg">Tavsiya etilgan amallar</h4>
              <ul className="space-y-2">
                {analysis.result.actions.map((action) => (
                  <li key={action.topicId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="text-fg">{action.text}</span>
                    <Button variant="secondary" leftIcon={<Wand2 className="size-4" aria-hidden />} loading={propose.isPending && propose.variables === action.topicId} onClick={() => propose.mutate(action.topicId)}>
                      Remedial reja
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan && <RemedialPlan key={plan.id} plan={plan} onDone={() => setPlan(null)} />}
        </div>
      )}
    </Modal>
  );
}
