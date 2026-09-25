import { BookOpenCheck, CalendarCheck, FileCheck, MessageSquareText, Sparkles, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { WeeklyReport } from '@/types/portal';
import { formatDate, formatDateTime } from '@/utils/format';
import { GRADE_TONES, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-fg-muted" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

/**
 * Haftalik hisobot ko‘rinishi — kabinetda (o‘quvchi/ota-ona) va xodim oynasida bir xil.
 * Chop etishga moslangan: bo‘limlar sahifa o‘rtasida bo‘linmaydi.
 */
export function WeeklyReportView({ report }: { report: WeeklyReport }) {
  const { attendance, homework, exams, xp, progress, topics, feedback } = report;

  return (
    <div className="space-y-4">
      <Card className="break-inside-avoid">
        <CardContent>
          <p className="text-xs text-fg-muted">{report.week.label}</p>
          <p className="text-lg font-semibold text-fg">{report.student.fullName}</p>
          <p className="text-sm text-fg-muted">
            {report.student.code} · {report.student.courseName}
            {report.student.groupName ? ` · ${report.student.groupName}` : ''}
          </p>
          {report.summary.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg">
              {report.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
        <Section icon={CalendarCheck} title="Davomat">
          {attendance.total === 0 ? (
            <p className="text-fg-muted">Bu hafta davomat belgilanmagan.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Foiz" value={`${attendance.rate ?? 0}%`} />
                <Stat label="Keldi" value={String(attendance.present)} />
                <Stat label="Kechikdi" value={String(attendance.late)} />
                <Stat label="Kelmadi" value={String(attendance.absent)} />
              </div>
              {attendance.absentDates.length > 0 && (
                <p className="mt-2 text-xs text-fg-muted">Kelmagan kunlar: {attendance.absentDates.map((date) => formatDate(date)).join(', ')}</p>
              )}
            </>
          )}
        </Section>

        <Section icon={BookOpenCheck} title="Uy vazifalari">
          {homework.total === 0 ? (
            <p className="text-fg-muted">Bu hafta vazifa berilmagan.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Topshirildi" value={`${homework.submitted}/${homework.total}`} />
                <Stat label="O‘rtacha" value={homework.averagePercent === null ? '—' : `${homework.averagePercent}%`} />
                <Stat label="Topshirilmagan" value={String(homework.pending + homework.missed)} />
              </div>
              <ul className="mt-3 divide-y divide-border">
                {homework.items.map((item) => (
                  <li key={`${item.title}-${item.deadline}`} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate text-fg">{item.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.score !== null && <span className="tabular-nums text-fg-muted">{item.score}/{item.maxPoints}</span>}
                      <Badge tone={SUBMISSION_STATUS_TONES[item.status]}>{SUBMISSION_STATUS_LABELS[item.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        <Section icon={FileCheck} title="Imtihonlar">
          {exams.length === 0 ? (
            <p className="text-fg-muted">Bu hafta imtihon natijasi yo‘q.</p>
          ) : (
            <ul className="divide-y divide-border">
              {exams.map((exam) => (
                <li key={`${exam.title}-${exam.date}`} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-fg">
                    {exam.title} <span className="text-xs text-fg-muted">· {formatDate(exam.date)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <b className="tabular-nums text-fg">{exam.percentage}%</b>
                    {exam.grade && <Badge tone={GRADE_TONES[exam.grade] ?? 'gray'}>{exam.grade}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Sparkles} title="XP va progress">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Hafta XP" value={`+${xp.earned}`} />
            <Stat label="Daraja" value={`${xp.level}`} />
            <Stat label="Kurs" value={progress.coursePercent === null ? '—' : `${progress.coursePercent}%`} />
          </div>
          {progress.topicsCompleted.length > 0 && (
            <p className="mt-2 text-xs text-fg-muted">Bu hafta o‘tilgan mavzular: {progress.topicsCompleted.join(', ')}</p>
          )}
        </Section>

        <Section icon={TrendingUp} title="Mavzular (oxirgi 30 kun)">
          {topics.strong.length === 0 && topics.weak.length === 0 ? (
            <p className="text-fg-muted">Mavzu bo‘yicha baholangan javoblar hali yo‘q.</p>
          ) : (
            <div className="space-y-2">
              {topics.strong.length > 0 && (
                <p>
                  <span className="text-emerald-600 dark:text-emerald-400">Kuchli:</span> {topics.strong.join(', ')}
                </p>
              )}
              {topics.weak.length > 0 && (
                <p>
                  <span className="text-amber-600 dark:text-amber-400">Mashq kerak:</span> {topics.weak.join(', ')}
                </p>
              )}
            </div>
          )}
        </Section>

        <Section icon={MessageSquareText} title="O‘qituvchi izohlari">
          {feedback.length === 0 ? (
            <p className="text-fg-muted">Bu hafta izoh qoldirilmagan.</p>
          ) : (
            <ul className="space-y-2">
              {feedback.map((item) => (
                <li key={`${item.source}-${item.title}-${item.date}`}>
                  <p className="text-fg">{item.text}</p>
                  <p className="text-xs text-fg-muted">
                    {item.title}
                    {item.author ? ` · ${item.author}` : ''} · {formatDateTime(item.date)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
