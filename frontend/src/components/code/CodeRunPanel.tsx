import { CheckCircle2, Clock, EyeOff, RefreshCw, XCircle } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { CodeRun, CodeRunStatus } from '@/types/codeRun';

const STATUS: Record<CodeRunStatus, { label: string; tone: 'gray' | 'blue' | 'green' | 'red' | 'yellow' }> = {
  QUEUED: { label: 'Navbatda', tone: 'blue' },
  RUNNING: { label: 'Tekshirilmoqda', tone: 'blue' },
  PASSED: { label: 'Hamma testlar o‘tdi', tone: 'green' },
  FAILED: { label: 'Testlar o‘tmadi', tone: 'yellow' },
  ERROR: { label: 'Tekshirib bo‘lmadi', tone: 'red' },
};

const REASONS: Record<string, string> = {
  timeout: 'vaqt tugadi',
  memory: 'xotira chegarasi',
  output_limit: 'chiqish juda katta',
  error: 'xato bilan tugadi',
  runner_error: 'sandbox xatosi',
};

interface CodeRunPanelProps {
  run: CodeRun | null;
  enabled: boolean;
  /** Tekshirish uchun vazifada testlar bormi */
  hasTests: boolean;
  onRerun?: () => void;
  rerunning?: boolean;
}

/**
 * Sandbox natijasi (TZ 3.1 GAP-19). Natija yo'q bo'lsa — nega yo'qligi aniq yoziladi; "o'tdi" faqat runner
 * haqiqatan bajarganida ko'rinadi.
 */
export function CodeRunPanel({ run, enabled, hasTests, onRerun, rerunning = false }: CodeRunPanelProps) {
  if (!hasTests) return null;
  if (!enabled && !run) {
    return <Alert tone="info">Kod avtomatik tekshirilmaydi — sandbox (kod bajarish serveri) hali ulanmagan. O‘qituvchi kodni o‘zi ko‘rib chiqadi.</Alert>;
  }
  return (
    <section aria-label="Kod tekshiruvi" className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          Avtomatik tekshiruv
          {run ? <Badge tone={STATUS[run.status].tone}>{STATUS[run.status].label}</Badge> : <Badge tone="gray">Hali tekshirilmagan</Badge>}
          {run?.total ? (
            <span className="text-xs text-fg-muted">
              {run.passed ?? 0}/{run.total} test
            </span>
          ) : null}
        </p>
        {onRerun && enabled && (
          <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="size-3.5" />} loading={rerunning} onClick={onRerun}>
            Qayta tekshirish
          </Button>
        )}
      </div>
      {run?.status === 'ERROR' && run.error && <p className="text-xs text-red-600 dark:text-red-400">{run.error}</p>}
      {run && run.tests.length > 0 && (
        <ul className="space-y-1.5">
          {run.tests.map((test) => (
            <li key={test.index} className="rounded-md bg-surface-muted p-2 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                {test.passed ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : test.status === 'timeout' ? <Clock className="size-3.5 text-amber-600" aria-hidden /> : <XCircle className="size-3.5 text-red-600" aria-hidden />}
                Test {test.index}: {test.passed ? 'o‘tdi' : `o‘tmadi${REASONS[test.status] ? ` (${REASONS[test.status]})` : ''}`}
                <span className="font-normal text-fg-subtle">· {test.timeMs} ms</span>
                {test.hidden && (
                  <span className="inline-flex items-center gap-0.5 font-normal text-fg-subtle">
                    <EyeOff className="size-3" aria-hidden /> yashirin
                  </span>
                )}
              </p>
              {test.input !== null && (
                <div className="mt-1 grid gap-1 sm:grid-cols-3">
                  <pre className="overflow-auto rounded bg-surface p-1.5">kirish: {test.input || '—'}</pre>
                  <pre className="overflow-auto rounded bg-surface p-1.5">kutilgan: {test.expected}</pre>
                  <pre className="overflow-auto rounded bg-surface p-1.5">chiqdi: {test.stdout || '—'}</pre>
                </div>
              )}
              {test.stderr ? <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface p-1.5 text-red-700 dark:text-red-300">{test.stderr}</pre> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
