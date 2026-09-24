import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { aiService } from '@/services/ai.service';
import type { AiAnswer } from '@/types/ai';
import { formatDateTime } from '@/utils/format';

/**
 * AI yordamchi: tabiiy tildagi savolga CRM ma'lumotlari asosida javob.
 *
 * Javob har doim oldindan yozilgan, ruxsat tekshiriladigan so'rovlardan keladi — model
 * bazaga to'g'ridan-to'g'ri murojaat qilmaydi. Shuning uchun javobdagi raqamlar
 * sahifalardagi raqamlar bilan bir xil bo'ladi.
 */
export default function AssistantPage() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toolsQuery = useQuery({ queryKey: queryKeys.ai.tools, queryFn: aiService.tools, staleTime: 5 * 60_000 });
  const historyQuery = useQuery({ queryKey: queryKeys.ai.history, queryFn: aiService.history });

  const ask = useMutation({
    mutationFn: ({ text, toolKey }: { text: string; toolKey?: string }) => aiService.ask(text, toolKey),
    onSuccess: (result) => {
      setAnswer(result);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.history });
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  function submit(text: string, toolKey?: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    setQuestion(trimmed);
    ask.mutate({ text: trimmed, ...(toolKey ? { toolKey } : {}) });
  }

  const allowedTools = (toolsQuery.data ?? []).filter((tool) => tool.allowed);

  return (
    <>
      <PageHeader
        title="AI yordamchi"
        description="Savol bering — javob CRM ma’lumotlaridan olinadi va sizning ruxsatlaringiz doirasida bo‘ladi"
      />

      <Card className="mb-6">
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              submit(question);
            }}
          >
            <Input
              value={question}
              placeholder="Masalan: Bugun qancha pul tushdi?"
              aria-label="Savol"
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Button
              type="submit"
              leftIcon={<Sparkles className="size-4" aria-hidden />}
              disabled={question.trim().length < 3}
              loading={ask.isPending}
            >
              So‘rash
            </Button>
          </form>

          {error && (
            <Alert tone="error" className="mt-3">
              {error}
            </Alert>
          )}

          {ask.isPending && <Skeleton className="mt-4 h-20 w-full" />}

          {answer && !ask.isPending && (
            <div className="mt-4 rounded-lg border border-border bg-surface-muted p-4">
              <p className="text-sm text-fg-subtle">{answer.question}</p>
              <p className="mt-1 text-base font-medium text-fg">{answer.answer}</p>

              {answer.details.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-fg-muted">
                  {answer.details.map((detail) => (
                    <li key={detail}>· {detail}</li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {answer.tool && <span className="text-xs text-fg-subtle">Manba: {answer.tool.title}</span>}
                {answer.link && (
                  <Link
                    to={answer.link}
                    className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
                  >
                    To‘liq ko‘rish
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>

              {!answer.answered && answer.suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {answer.suggestions.map((suggestion) => (
                    <Button key={suggestion} size="sm" variant="secondary" onClick={() => submit(suggestion)}>
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Nimalarni so‘rash mumkin</CardTitle>
            <span className="text-xs text-fg-muted">ruxsatingizga mos savollar</span>
          </CardHeader>
          <CardContent>
            {toolsQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : allowedTools.length === 0 ? (
              <p className="text-sm text-fg-muted">Sizning ruxsatlaringiz bilan javob beriladigan savol turi yo‘q.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {allowedTools.map((tool) => (
                  <li key={tool.key}>
                    <button
                      type="button"
                      onClick={() => submit(tool.samples[0] ?? tool.title, tool.key)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-brand-300 hover:bg-surface-muted dark:hover:border-brand-800"
                    >
                      <span className="block text-sm text-fg">{tool.samples[0] ?? tool.title}</span>
                      <span className="block text-xs text-fg-subtle">{tool.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>So‘nggi savollar</CardTitle>
          </CardHeader>
          <CardContent>
            {historyQuery.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : (historyQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-fg-muted">Hali savol bermagansiz.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(historyQuery.data ?? []).slice(0, 8).map((item) => (
                  <li key={item.id} className="py-2">
                    <button type="button" className="w-full text-left" onClick={() => submit(item.question)}>
                      <span className="block truncate text-sm text-fg">{item.question}</span>
                      <span className="block text-xs text-fg-subtle">{formatDateTime(item.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
