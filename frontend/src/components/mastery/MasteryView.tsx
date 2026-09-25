import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ProgressHistoryPoint, StudentMastery, TopicMastery } from '@/types/mastery';
import { MASTERY_LEVEL_LABELS, MASTERY_STATUS_LABELS, MASTERY_STATUS_TONES, masteryBarClass } from '@/utils/masteryLabels';

const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

function sourceLine(topic: TopicMastery): string {
  const parts = [
    topic.sources.exam !== null ? `imtihon ${topic.sources.exam}%` : null,
    topic.sources.homework !== null ? `vazifa ${topic.sources.homework}%` : null,
    topic.sources.attendance !== null ? `davomat ${topic.sources.attendance}%` : null,
    topic.sources.lessons !== null ? `darslar ${topic.sources.lessons}%` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Hali ma’lumot yo‘q';
}

function TopicRow({ topic }: { topic: TopicMastery }) {
  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{topic.title}</span>
        <Badge tone={MASTERY_STATUS_TONES[topic.status]}>{MASTERY_STATUS_LABELS[topic.status]}</Badge>
        <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-fg">{topic.score === null ? '—' : `${topic.score}%`}</span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-label={`${topic.title} o‘zlashtirish`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={topic.score ?? 0}
        aria-valuetext={topic.score === null ? 'baho yo‘q' : `${topic.score}% — ${topic.level ? MASTERY_LEVEL_LABELS[topic.level] : ''}`}
      >
        <div className={cn('h-full rounded-full', masteryBarClass(topic.level))} style={{ width: `${topic.score ?? 0}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-fg-subtle">{sourceLine(topic)}</p>
    </li>
  );
}

/**
 * Mavzular bo'yicha o'zlashtirish (TZ §26–27): umumiy ko'rsatkich, modullar kesimida mavzular
 * (baho, holat, manbalar) va oylik tarix. Xodim profili va kabinetda bir xil ko'rinadi.
 */
export function MasteryView({ mastery, history = [] }: { mastery: StudentMastery; history?: ProgressHistoryPoint[] }) {
  const { overall, settings } = mastery;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
          <div>
            <p className="text-xs text-fg-muted">O‘rtacha o‘zlashtirish</p>
            <p className="text-3xl font-semibold tabular-nums text-fg">{overall.score === null ? '—' : `${overall.score}%`}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {(
              [
                ['O‘zlashtirilgan', overall.mastered],
                ['Mustahkamlanmoqda', overall.practicing],
                ['O‘rganilmoqda', overall.learning],
                ['Boshlanmagan', overall.notStarted],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className="font-medium tabular-nums text-fg">
                  {value}/{overall.topics}
                </dd>
              </div>
            ))}
          </dl>
          <p className="w-full text-xs text-fg-subtle">
            Chegaralar: {settings.thresholds.developing}% — rivojlanmoqda, {settings.thresholds.good}% — yaxshi, {settings.thresholds.mastered}% — o‘zlashtirilgan. Baho imtihon va vazifa natijasi bo‘lganda chiqadi.
          </p>
        </CardContent>
      </Card>

      {mastery.modules.length === 0 ? (
        <Card>
          <CardContent className="pt-4 text-sm text-fg-muted">Kurs dasturida mavzular hali kiritilmagan.</CardContent>
        </Card>
      ) : (
        mastery.modules.map((module) => (
          <Card key={module.id}>
            <CardHeader>
              <CardTitle>{module.title}</CardTitle>
              <CardDescription>{module.score === null ? 'Hali baho yo‘q' : `O‘rtacha ${module.score}%`}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {module.topics.map((topic) => (
                  <TopicRow key={topic.topicId} topic={topic} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Oylik progress</CardTitle>
            <CardDescription>Har oy oxiridagi holat</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-muted">
                  <th className="py-1 pr-3 font-medium">Oy</th>
                  <th className="py-1 pr-3 font-medium">O‘zlashtirish</th>
                  <th className="py-1 pr-3 font-medium">Davomat</th>
                  <th className="py-1 pr-3 font-medium">Vazifa</th>
                  <th className="py-1 pr-3 font-medium">Imtihon</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {history.map((point) => (
                  <tr key={point.month} className="border-t border-border">
                    <td className="py-1 pr-3 text-fg">
                      {MONTH_LABELS[Number(point.month.slice(5, 7)) - 1]} {point.month.slice(0, 4)}
                    </td>
                    <td className="py-1 pr-3 text-fg">{point.masteryScore === null ? '—' : `${point.masteryScore}%`}</td>
                    <td className="py-1 pr-3 text-fg-muted">{point.attendanceRate}%</td>
                    <td className="py-1 pr-3 text-fg-muted">{point.homeworkRate}%</td>
                    <td className="py-1 pr-3 text-fg-muted">{point.averageScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
