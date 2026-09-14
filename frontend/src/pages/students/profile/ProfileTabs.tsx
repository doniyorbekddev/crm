import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Award, BookOpenCheck, CalendarCheck, CreditCard, FileCheck, MessageSquareText, Sparkles, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService } from '@/services/payments.service';
import { studentsService } from '@/services/students.service';
import type { StudentActivity, StudentProfile } from '@/types/studentProfile';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/utils/format';
import { GRADE_TONES, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';
import { PAYMENT_METHOD_LABELS } from '@/utils/paymentLabels';
import { ProgressChart } from './ProgressChart';

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          !tone && 'text-fg',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

function rateTone(rate: number): 'good' | 'warn' | 'bad' {
  if (rate >= 85) return 'good';
  if (rate >= 60) return 'warn';
  return 'bad';
}

export function OverviewTab({ profile, onOpenCalendar }: { profile: StudentProfile; onOpenCalendar: () => void }) {
  const { attendance, homework, exams, student } = profile;
  const debt = student.debt?.remaining ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={onOpenCalendar} className="text-left">
          <StatTile
            label="Davomat"
            value={`${attendance.rate}%`}
            hint={`${formatNumber(attendance.total)} dars · ${formatNumber(attendance.absent)} ta qoldirgan`}
            tone={attendance.total ? rateTone(attendance.rate) : undefined}
          />
        </button>
        <StatTile
          label="Uy vazifasi"
          value={`${homework.rate}%`}
          hint={`${formatNumber(homework.submitted)}/${formatNumber(homework.assigned)} · o‘rtacha ${homework.averagePercent}%`}
          tone={homework.assigned ? rateTone(homework.rate) : undefined}
        />
        <StatTile
          label="Imtihonlar o‘rtachasi"
          value={exams.count ? `${exams.averagePercent}%` : '—'}
          hint={exams.count ? `${formatNumber(exams.count)} ta · eng yuqori ${exams.best ?? 0}%` : 'Hali imtihon yo‘q'}
          tone={exams.count ? rateTone(exams.averagePercent) : undefined}
        />
        <StatTile
          label="Qarzdorlik"
          value={formatMoney(debt)}
          hint={student.debt ? `Shartnoma: ${formatMoney(student.debt.total)}` : undefined}
          tone={debt > 0 ? 'bad' : 'good'}
        />
      </div>

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
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Vazifa</TH>
                <TH>Muddat</TH>
                <TH>Holat</TH>
                <TH className="text-right">Ball</TH>
                <TH>Izoh</TH>
              </tr>
            </THead>
            <TBody>
              {query.data.map((row) => (
                <TR key={row.homeworkId}>
                  <TD>
                    <p className="font-medium text-fg">{row.title}</p>
                    <p className="text-xs text-fg-muted">
                      {row.groupName}
                      {row.xpAwarded > 0 && ` · +${row.xpAwarded} XP`}
                    </p>
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(row.deadline)}</TD>
                  <TD>
                    <Badge tone={SUBMISSION_STATUS_TONES[row.status]}>{SUBMISSION_STATUS_LABELS[row.status]}</Badge>
                  </TD>
                  <TD className="text-right whitespace-nowrap text-fg">{row.score === null ? '—' : `${row.score}/${row.maxPoints}`}</TD>
                  <TD className="max-w-[16rem] truncate text-fg-muted">{row.feedback ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
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
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Imtihon</TH>
                <TH>Sana</TH>
                <TH className="text-right">Ball</TH>
                <TH className="text-right">Foiz</TH>
                <TH>Baho</TH>
                <TH>Izoh</TH>
              </tr>
            </THead>
            <TBody>
              {query.data.map((row) => (
                <TR key={row.examId}>
                  <TD>
                    <p className="font-medium text-fg">{row.title}</p>
                    <p className="text-xs text-fg-muted">
                      {row.groupName}
                      {row.xpAwarded > 0 && ` · +${row.xpAwarded} XP`}
                    </p>
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">{formatDate(row.date)}</TD>
                  <TD className="text-right text-fg">
                    {row.score}/{row.maxScore}
                  </TD>
                  <TD className="text-right tabular-nums text-fg">{row.percentage}%</TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      {row.grade && <Badge tone={GRADE_TONES[row.grade] ?? 'gray'}>{row.grade}</Badge>}
                      {row.passed !== null && (
                        <span className={cn('text-xs', row.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                          {row.passed ? 'O‘tdi' : 'O‘tmadi'}
                        </span>
                      )}
                    </span>
                  </TD>
                  <TD className="max-w-[16rem] truncate text-fg-muted">{row.comment ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
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
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH>Kvitansiya</TH>
                <TH>Summa</TH>
                <TH>Usul</TH>
                <TH>Sana</TH>
              </tr>
            </THead>
            <TBody>
              {query.data.items.map((payment) => (
                <TR key={payment.id} className={cn(payment.isDeleted && 'opacity-60')}>
                  <TD className="font-mono text-xs text-fg-muted">
                    {payment.code}
                    {payment.isDeleted && (
                      <Badge tone="red" className="ml-2">
                        Bekor qilingan
                      </Badge>
                    )}
                  </TD>
                  <TD className={cn('font-medium', payment.isDeleted ? 'text-fg-muted line-through' : 'text-fg')}>
                    {formatMoney(payment.amount)}
                  </TD>
                  <TD className="text-fg-muted">{PAYMENT_METHOD_LABELS[payment.method]}</TD>
                  <TD className="whitespace-nowrap text-fg-muted">{formatDate(payment.paidAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
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
                  <span className={cn('shrink-0 text-sm font-semibold', row.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
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
                  item.tone === 'positive' && 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400',
                  item.tone === 'negative' && 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400',
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
