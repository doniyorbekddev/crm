import { DataTable } from '@/components/ui/DataTable';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Award, BookOpenCheck, CalendarCheck, CreditCard, FileCheck, MessageSquareText, Sparkles, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import type { StatTone } from '@/components/ui/StatCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService } from '@/services/payments.service';
import { studentsService } from '@/services/students.service';
import type { StudentActivity, StudentProfile } from '@/types/studentProfile';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/utils/format';
import { GRADE_TONES, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';
import { PAYMENT_METHOD_LABELS } from '@/utils/paymentLabels';
import { ProgressChart } from './ProgressChart';
import { CertificatesCard } from './CertificatesCard';
import { DiscountsCard } from './DiscountsCard';
import { CurriculumProgressCard } from './CurriculumProgressCard';
import { RiskCard } from './RiskCard';

function rateTone(rate: number): StatTone {
  if (rate >= 85) return 'success';
  if (rate >= 60) return 'warning';
  return 'danger';
}

export function OverviewTab({ profile, onOpenCalendar }: { profile: StudentProfile; onOpenCalendar: () => void }) {
  const { attendance, homework, exams, student } = profile;
  const debt = student.debt?.remaining ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={onOpenCalendar} className="focus-ring rounded-card text-left" aria-label="Davomat — kalendarni ochish">
          <StatCard
            size="sm"
            icon={CalendarCheck}
            title="Davomat"
            value={`${attendance.rate}%`}
            description={`${formatNumber(attendance.total)} dars · ${formatNumber(attendance.absent)} ta qoldirgan`}
            tone={attendance.total ? rateTone(attendance.rate) : 'neutral'}
            className="transition-colors hover:border-fg-subtle/50 hover:bg-surface-muted/50"
          />
        </button>
        <StatCard
          size="sm"
          icon={BookOpenCheck}
          title="Uy vazifasi"
          value={`${homework.rate}%`}
          description={`${formatNumber(homework.submitted)}/${formatNumber(homework.assigned)} · o‘rtacha ${homework.averagePercent}%`}
          tone={homework.assigned ? rateTone(homework.rate) : 'neutral'}
        />
        <StatCard
          size="sm"
          icon={FileCheck}
          title="Imtihonlar o‘rtachasi"
          value={exams.count ? `${exams.averagePercent}%` : '—'}
          description={exams.count ? `${formatNumber(exams.count)} ta · eng yuqori ${exams.best ?? 0}%` : 'Hali imtihon yo‘q'}
          tone={exams.count ? rateTone(exams.averagePercent) : 'neutral'}
        />
        <StatCard
          size="sm"
          icon={Wallet}
          title="Qarzdorlik"
          value={formatMoney(debt)}
          {...(student.debt ? { description: `Shartnoma: ${formatMoney(student.debt.total)}` } : {})}
          tone={debt > 0 ? 'danger' : 'success'}
        />
      </div>

      <RiskCard studentId={student.id} />

      <DiscountsCard studentId={student.id} />

      <CurriculumProgressCard studentId={student.id} />

      <CertificatesCard studentId={student.id} />

      <Card>
        <CardHeader>
          <CardTitle>Progress dinamikasi</CardTitle>
          <span className="text-xs text-fg-muted">oxirgi 6 oy</span>
        </CardHeader>
        <CardContent>
          <ProgressChart data={profile.progress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>O‘qituvchi izohlari</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {profile.feedback.length === 0 ? (
            <EmptyState icon={MessageSquareText} title="Izoh yo‘q" description="Baholashda yozilgan izohlar shu yerda ko‘rinadi" />
          ) : (
            <ul className="divide-y divide-border">
              {profile.feedback.map((item, index) => (
                <li key={`${item.type}-${item.date}-${index}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-fg">
                      <Badge tone={item.type === 'exam' ? 'purple' : 'blue'}>{item.type === 'exam' ? 'Imtihon' : 'Uy vazifasi'}</Badge>
                      {item.title}
                    </p>
                    <span className="text-xs text-fg-muted">
                      {item.percentage !== null && `${item.percentage}% · `}
                      {formatDate(item.date)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-fg">“{item.text}”</p>
                  {item.author && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      — {item.author.firstName} {item.author.lastName}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function HomeworkTab({ studentId }: { studentId: string }) {
  const query = useQuery({ queryKey: queryKeys.students.homework(studentId), queryFn: () => studentsService.homework(studentId) });

  return (
    <Card>
      {query.isPending ? (
        <TableSkeleton rows={5} columns={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="Uy vazifasi yo‘q" description="Guruhga vazifa berilganda shu yerda ko‘rinadi" />
      ) : (
        <DataTable
          bare
          label="Uy vazifalari"
          rows={query.data}
          rowKey={(row) => row.homeworkId}
          mobileLayout="cards"
          columns={[
            {
              key: 'c0',
              label: 'Vazifa',
              cell: (row) => (
                <>
                  <p className="font-medium text-fg">{row.title}</p>
                  <p className="text-xs text-fg-muted">
                    {row.groupName}
                    {row.xpAwarded > 0 && ` · +${row.xpAwarded} XP`}
                  </p>
                </>
              ),
            },
            {
              key: 'c1',
              label: 'Muddat',
              tdClassName: 'whitespace-nowrap text-fg-muted',
              cell: (row) => <>{formatDateTime(row.deadline)}</>,
            },
            {
              key: 'c2',
              label: 'Holat',
              cell: (row) => (
                <>
                  <Badge tone={SUBMISSION_STATUS_TONES[row.status]}>{SUBMISSION_STATUS_LABELS[row.status]}</Badge>
                </>
              ),
            },
            {
              key: 'c3',
              label: 'Ball',
              thClassName: 'text-right',
              tdClassName: 'text-right whitespace-nowrap text-fg',
              cell: (row) => <>{row.score === null ? '—' : `${row.score}/${row.maxPoints}`}</>,
            },
            {
              key: 'c4',
              label: 'Izoh',
              tdClassName: 'max-w-[16rem] truncate text-fg-muted',
              cell: (row) => <>{row.feedback ?? '—'}</>,
            },
          ]}
        />
      )}
    </Card>
  );
}

export function ExamsTab({ studentId }: { studentId: string }) {
  const query = useQuery({ queryKey: queryKeys.students.exams(studentId), queryFn: () => studentsService.exams(studentId) });

  return (
    <Card>
      {query.isPending ? (
        <TableSkeleton rows={5} columns={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={FileCheck} title="Imtihon natijasi yo‘q" description="Natija kiritilganda shu yerda ko‘rinadi" />
      ) : (
        <DataTable
          bare
          label="Imtihonlar"
          rows={query.data}
          rowKey={(row) => row.examId}
          mobileLayout="cards"
          columns={[
            {
              key: 'c0',
              label: 'Imtihon',
              cell: (row) => (
                <>
                  <p className="font-medium text-fg">{row.title}</p>
                  <p className="text-xs text-fg-muted">
                    {row.groupName}
                    {row.xpAwarded > 0 && ` · +${row.xpAwarded} XP`}
                  </p>
                </>
              ),
            },
            {
              key: 'c1',
              label: 'Sana',
              tdClassName: 'whitespace-nowrap text-fg-muted',
              cell: (row) => <>{formatDate(row.date)}</>,
            },
            {
              key: 'c2',
              label: 'Ball',
              thClassName: 'text-right',
              tdClassName: 'text-right text-fg',
              cell: (row) => (
                <>
                  {row.score}/{row.maxScore}
                </>
              ),
            },
            {
              key: 'c3',
              label: 'Foiz',
              thClassName: 'text-right',
              tdClassName: 'text-right tabular-nums text-fg',
              cell: (row) => <>{row.percentage}%</>,
            },
            {
              key: 'c4',
              label: 'Baho',
              cell: (row) => (
                <>
                  <span className="flex items-center gap-2">
                    {row.grade && <Badge tone={GRADE_TONES[row.grade] ?? 'gray'}>{row.grade}</Badge>}
                    {row.passed !== null && (
                      <span className={cn('text-xs', row.passed ? 'text-success' : 'text-danger')}>
                        {row.passed ? 'O‘tdi' : 'O‘tmadi'}
                      </span>
                    )}
                  </span>
                </>
              ),
            },
            {
              key: 'c5',
              label: 'Izoh',
              tdClassName: 'max-w-[16rem] truncate text-fg-muted',
              cell: (row) => <>{row.comment ?? '—'}</>,
            },
          ]}
        />
      )}
    </Card>
  );
}

export function PaymentsTab({ studentId }: { studentId: string }) {
  const params = { page: 1, limit: 50, studentId, includeDeleted: 'true' as const };
  const query = useQuery({ queryKey: queryKeys.payments.list(params), queryFn: () => paymentsService.list(params) });

  return (
    <Card>
      {query.isPending ? (
        <TableSkeleton rows={4} columns={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={Wallet} title="To‘lov yo‘q" description="Qabul qilingan to‘lovlar shu yerda ko‘rinadi" />
      ) : (
        <DataTable
          bare
          label="To‘lovlar"
          rows={query.data.items}
          rowKey={(payment) => payment.id}
          rowClassName={(payment) => cn(payment.isDeleted && 'opacity-60')}
          mobileLayout="cards"
          columns={[
            {
              key: 'c0',
              label: 'Kvitansiya',
              tdClassName: 'font-mono text-xs text-fg-muted',
              cell: (payment) => (
                <>
                  {payment.code}
                  {payment.isDeleted && (
                    <Badge tone="red" className="ml-2">
                      Bekor qilingan
                    </Badge>
                  )}
                </>
              ),
            },
            {
              key: 'c1',
              label: 'Summa',
              tdClassName: (payment) => cn('font-medium', payment.isDeleted ? 'text-fg-muted line-through' : 'text-fg'),
              cell: (payment) => (
                <>
                  {formatMoney(payment.amount)}
                </>
              ),
            },
            {
              key: 'c2',
              label: 'Usul',
              tdClassName: 'text-fg-muted',
              cell: (payment) => <>{PAYMENT_METHOD_LABELS[payment.method]}</>,
            },
            {
              key: 'c3',
              label: 'Sana',
              tdClassName: 'whitespace-nowrap text-fg-muted',
              cell: (payment) => <>{formatDate(payment.paidAt)}</>,
            },
          ]}
        />
      )}
    </Card>
  );
}

export function AchievementsTab({ profile }: { profile: StudentProfile }) {
  const { gamification } = profile;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Nishonlar</CardTitle>
          <span className="text-xs text-fg-muted">{formatNumber(gamification.badges.length)} ta</span>
        </CardHeader>
        <CardContent className="p-0">
          {gamification.badges.length === 0 ? (
            <EmptyState icon={Award} title="Nishon yo‘q" description="Davomat, vazifa va imtihon natijalari uchun avtomatik beriladi" />
          ) : (
            <ul className="grid gap-2 p-4 sm:grid-cols-2">
              {gamification.badges.map((badge) => (
                <li key={badge.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="text-2xl">{badge.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{badge.name}</p>
                    <p className="text-xs text-fg-muted">{formatDate(badge.awardedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>So‘nggi XP</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {gamification.recentXp.length === 0 ? (
            <EmptyState icon={Sparkles} title="XP yo‘q" description="Darsga kelganda XP beriladi" />
          ) : (
            <ul className="divide-y divide-border">
              {gamification.recentXp.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{row.description}</p>
                    <p className="text-xs text-fg-muted">{formatDateTime(row.createdAt)}</p>
                  </div>
                  <span className={cn('shrink-0 text-sm font-semibold', row.points >= 0 ? 'text-success' : 'text-danger')}>
                    {row.points > 0 ? '+' : ''}
                    {row.points} XP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const ACTIVITY_ICONS: Record<StudentActivity['type'], LucideIcon> = {
  attendance: CalendarCheck,
  payment: CreditCard,
  homework: BookOpenCheck,
  exam: FileCheck,
  xp: Sparkles,
  badge: Award,
  group: ArrowLeftRight,
};

export function ActivityTab({ profile }: { profile: StudentProfile }) {
  if (profile.activity.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarCheck} title="Faollik yo‘q" description="Davomat, to‘lov va baholashlar shu yerda ko‘rinadi" />
      </Card>
    );
  }

  return (
    <Card>
      <ol className="relative space-y-4 p-4 before:absolute before:top-6 before:bottom-6 before:left-[29px] before:w-px before:bg-border">
        {profile.activity.map((item, index) => {
          const Icon = ACTIVITY_ICONS[item.type];
          return (
            <li key={`${item.type}-${item.date}-${index}`} className="relative flex gap-3">
              <span
                className={cn(
                  'z-10 grid size-7 shrink-0 place-items-center rounded-full border',
                  item.tone === 'positive' && 'border-success-border bg-success-subtle text-success',
                  item.tone === 'negative' && 'border-danger-border bg-danger-subtle text-danger',
                  item.tone === 'neutral' && 'border-border bg-surface-muted text-fg-muted',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-medium text-fg">{item.title}</p>
                  <span className="text-xs text-fg-subtle">{formatDate(item.date)}</span>
                </div>
                <p className="truncate text-xs text-fg-muted">{item.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
