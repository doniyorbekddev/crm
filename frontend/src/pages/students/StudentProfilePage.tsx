import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowLeftRight, Award, BookOpenCheck, CalendarCheck, CalendarClock, FileBarChart, FileCheck, Flame, History, LayoutDashboard, Target, UsersRound, Wallet } from 'lucide-react';
import { WeeklyReportModal } from '@/components/weekly/WeeklyReportModal';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import { formatDate, formatNumber, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '@/utils/studentLabels';
import { StudentAttendanceModal } from './StudentAttendanceModal';
import { GroupHistoryTab } from './profile/GroupHistoryTab';
import { MasteryTab } from './profile/MasteryTab';
import { ParentsTab } from './profile/ParentsTab';
import { PaymentScheduleTab } from './profile/PaymentScheduleTab';
import { AchievementsTab, ActivityTab, ExamsTab, HomeworkTab, OverviewTab, PaymentsTab } from './profile/ProfileTabs';

type Tab = 'overview' | 'mastery' | 'groups' | 'parents' | 'homework' | 'exams' | 'payments' | 'schedule' | 'achievements' | 'activity';

export default function StudentProfilePage() {
  const { id = '' } = useParams();
  const canViewHomework = usePermission(PERMISSIONS.HOMEWORK_VIEW);
  const canViewExams = usePermission(PERMISSIONS.EXAM_VIEW);
  const canViewAttendance = usePermission(PERMISSIONS.ATTENDANCE_VIEW);
  const canViewParents = usePermission(PERMISSIONS.PARENT_VIEW);
  const canViewDebts = usePermission(PERMISSIONS.DEBT_VIEW);
  const canViewPayments = usePermission(PERMISSIONS.PAYMENT_VIEW);
  const canManageStudents = usePermission(PERMISSIONS.STUDENT_MANAGE);
  const [tab, setTab] = useState<Tab>('overview');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: queryKeys.students.profile(id),
    queryFn: () => studentsService.profile(id),
    enabled: Boolean(id),
  });

  const back = (
    <Link to="/students" className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden />
      O‘quvchilar
    </Link>
  );

  if (profileQuery.isPending) {
    return (
      <>
        {back}
        <Skeleton className="mb-4 h-36 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  if (profileQuery.isError) {
    return (
      <>
        {back}
        <ErrorState error={profileQuery.error} retrying={profileQuery.isFetching} onRetry={() => void profileQuery.refetch()} />
      </>
    );
  }

  const profile = profileQuery.data;
  const { student, gamification } = profile;

  const tabs: ReadonlyArray<{ value: Tab; label: string; icon: LucideIcon }> = [
    { value: 'overview', label: 'Umumiy', icon: LayoutDashboard },
    { value: 'mastery', label: 'O‘zlashtirish', icon: Target },
    { value: 'groups', label: 'Guruh tarixi', icon: ArrowLeftRight },
    ...(canViewParents ? [{ value: 'parents' as const, label: 'Ota-ona', icon: UsersRound }] : []),
    ...(canViewHomework ? [{ value: 'homework' as const, label: 'Uy vazifasi', icon: BookOpenCheck }] : []),
    ...(canViewExams ? [{ value: 'exams' as const, label: 'Imtihonlar', icon: FileCheck }] : []),
    ...(profile.payments ? [{ value: 'payments' as const, label: 'To‘lovlar', icon: Wallet }] : []),
    ...(canViewDebts || canViewPayments ? [{ value: 'schedule' as const, label: 'To‘lov jadvali', icon: CalendarClock }] : []),
    { value: 'achievements', label: 'Yutuqlar', icon: Award },
    { value: 'activity', label: 'Faollik', icon: History },
  ];

  return (
    <>
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        documentTitle={`${student.firstName} ${student.lastName}`}
        actions={
          <Button variant="secondary" leftIcon={<FileBarChart className="size-4" aria-hidden />} onClick={() => setWeeklyOpen(true)}>
            Haftalik hisobot
          </Button>
        }
      />
      {weeklyOpen && <WeeklyReportModal studentId={student.id} onClose={() => setWeeklyOpen(false)} />}
      <div className="-mt-4">{back}</div>

      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar firstName={student.firstName} lastName={student.lastName} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-fg">
              {student.firstName} {student.lastName}
              <Badge tone={STUDENT_STATUS_TONES[student.status]}>{STUDENT_STATUS_LABELS[student.status]}</Badge>
            </p>
            <p className="mt-0.5 text-sm text-fg-muted">
              <span className="font-mono">{student.code}</span> · {student.course.name}
              {student.group && ` · ${student.group.name}`} · {formatPhone(student.phone)}
            </p>
            <p className="text-xs text-fg-subtle">
              O‘qish boshlangan: {formatDate(student.startDate)}
              {student.referralCode && (
                <>
                  {' · '}
                  Taklif kodi: <span className="font-mono text-fg-muted">{student.referralCode}</span>
                </>
              )}
            </p>

            <div className="mt-3 max-w-md">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-fg">
                  {gamification.level.icon ?? '⭐'} {gamification.level.number}-daraja · {gamification.level.name}
                </span>
                <span className="text-fg-muted">
                  {formatNumber(gamification.totalXp)} XP
                  {gamification.nextLevel && ` · keyingisiga ${formatNumber(gamification.nextLevel.xpLeft)}`}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(gamification.progress, 2)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:w-auto">
            <div className="rounded-xl border border-border px-3 py-2 text-center">
              <p className="text-xs text-fg-muted">Reyting</p>
              <p className="text-lg font-semibold text-fg">{gamification.rank ? `#${gamification.rank}` : '—'}</p>
            </div>
            <div className="rounded-xl border border-border px-3 py-2 text-center">
              <p className="text-xs text-fg-muted">Davomat</p>
              <p
                className={cn(
                  'text-lg font-semibold',
                  profile.attendance.rate >= 85 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                )}
              >
                {profile.attendance.total ? `${profile.attendance.rate}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border px-3 py-2 text-center">
              <p className="text-xs text-fg-muted">Seriya</p>
              <p className="inline-flex items-center gap-1 text-lg font-semibold text-amber-600 dark:text-amber-400">
                <Flame className="size-4" aria-hidden />
                {gamification.streak.current}
              </p>
            </div>
          </div>
        </div>

        {canViewAttendance && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="secondary" size="sm" leftIcon={<CalendarCheck className="size-4" aria-hidden />} onClick={() => setCalendarOpen(true)}>
              Davomat kalendari
            </Button>
          </div>
        )}
      </Card>

      <div role="tablist" aria-label="Profil bo‘limlari" className="mb-4 -mx-1 flex gap-1 overflow-x-auto px-1">
        {tabs.map((item) => {
          const active = tab === item.value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab profile={profile} onOpenCalendar={() => canViewAttendance && setCalendarOpen(true)} />}
      {tab === 'mastery' && <MasteryTab studentId={student.id} />}
      {tab === 'groups' && <GroupHistoryTab student={student} canManage={canManageStudents} />}
      {tab === 'parents' && <ParentsTab student={{ id: student.id, name: `${student.firstName} ${student.lastName}` }} />}
      {tab === 'homework' && <HomeworkTab studentId={student.id} />}
      {tab === 'exams' && <ExamsTab studentId={student.id} />}
      {tab === 'payments' && <PaymentsTab studentId={student.id} />}
      {tab === 'schedule' && <PaymentScheduleTab studentId={student.id} startDate={student.startDate} />}
      {tab === 'achievements' && <AchievementsTab profile={profile} />}
      {tab === 'activity' && <ActivityTab profile={profile} />}

      {calendarOpen && <StudentAttendanceModal student={student} onClose={() => setCalendarOpen(false)} />}
    </>
  );
}
