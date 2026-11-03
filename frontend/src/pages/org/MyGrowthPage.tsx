import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, Circle, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { orgService } from '@/services/org.service';
import type { ReviewCriterion } from '@/types/org';
import { formatDate, formatMoney } from '@/utils/format';
import { AWARD_LABELS, CRITERIA_LABELS, RATING_LABELS, RATING_TONES } from './PerformancePage';

/** Xodimning o'zi: karyera yo'li va talablar, tasdiqlangan baholashlar, taqdirlashlar (ORG §13) */
export default function MyGrowthPage() {
  const query = useQuery({ queryKey: ['org', 'my-growth'], queryFn: orgService.myGrowth });
  const data = query.data;
  const career = data?.career;

  return (
    <div className="space-y-6">
      <PageHeader title="Mening rivojlanishim" description="Lavozimdagi o‘sish yo‘li, baholash natijalari va taqdirlashlar" />
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4 text-fg-subtle" aria-hidden />
                Karyera yo‘li
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!career ? (
                <p className="text-body text-fg-muted">Xodim kartangiz bog‘lanmagan — karyera yo‘li ko‘rsatilmaydi.</p>
              ) : !career.next ? (
                <p className="text-body text-fg-muted">
                  {career.position.title} · lavozimda {career.monthsInPosition} oy. Keyingi lavozim hali belgilanmagan.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-body text-fg">
                    <span className="font-medium">{career.position.title}</span> → <span className="font-medium">{career.next.title}</span>
                    {career.pendingPromotion && (
                      <Badge tone="yellow" className="ml-2">
                        Tavsiya ko‘rib chiqilmoqda
                      </Badge>
                    )}
                  </p>
                  <ul className="space-y-1 text-body">
                    <Requirement done={career.meetsTenure} text={`Lavozimda ${career.monthsInPosition} oy${career.next.minimumMonths ? ` (kerak: ${career.next.minimumMonths})` : ''}`} />
                    <Requirement done={career.meetsKpi} text={`O‘rtacha KPI (3 oy): ${career.kpiAverage !== null ? `${career.kpiAverage}%` : '—'}${career.next.minimumKpiScore ? ` (kerak: ${career.next.minimumKpiScore}%)` : ''}`} />
                  </ul>
                  {career.next.requirements && <p className="whitespace-pre-line text-caption text-fg-muted">{career.next.requirements}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Baholash natijalari</CardTitle>
            </CardHeader>
            <CardContent>
              {data.reviews.length === 0 ? (
                <p className="text-body text-fg-muted">Tasdiqlangan baholash hali yo‘q.</p>
              ) : (
                <ul className="space-y-3">
                  {data.reviews.map((review) => (
                    <li key={review.id} className="rounded-md border border-border p-3">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                        {review.year}-yil {review.quarter}-chorak · {review.overallScore} / 5
                        <Badge tone={RATING_TONES[review.rating]}>{RATING_LABELS[review.rating]}</Badge>
                      </p>
                      <p className="text-caption text-fg-muted">
                        {(Object.keys(review.scores) as ReviewCriterion[]).map((key) => `${CRITERIA_LABELS[key]}: ${review.scores[key]}`).join(' · ')}
                      </p>
                      {review.strengths && <p className="mt-1 text-body text-fg">Kuchli tomonlar: {review.strengths}</p>}
                      {review.improvements && <p className="text-body text-fg">Rivojlantirish: {review.improvements}</p>}
                      {review.goals && <p className="text-body text-fg">Maqsadlar: {review.goals}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="size-4 text-fg-subtle" aria-hidden />
                Taqdirlashlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.awards.length === 0 ? (
                <EmptyState icon={Award} title="Hali taqdirlash yo‘q" description="Oy xodimi, mukofot va malaka oshirish shu yerda ko‘rinadi" />
              ) : (
                <ul className="space-y-2">
                  {data.awards.map((award) => (
                    <li key={award.id} className="text-body text-fg">
                      <span className="font-medium">{award.title}</span> · {AWARD_LABELS[award.type]}
                      {award.amount !== null ? ` · ${formatMoney(award.amount)}` : ''} · {formatDate(award.createdAt)}
                      <p className="text-caption text-fg-muted">{award.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Requirement({ done, text }: { done: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      {done ? <CheckCircle2 className="size-4 text-success" aria-label="Bajarilgan" /> : <Circle className="size-4 text-fg-subtle" aria-label="Bajarilmagan" />}
      {text}
    </li>
  );
}
