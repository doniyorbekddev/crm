import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Award,
  BookOpen,
  BookOpenCheck,
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  FileBarChart,
  FileCheck,
  Flame,
  Gift,
  Hash,
  History,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Phone,
  RefreshCw,
  Star,
  Target,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProfileHeader, ProfileStat } from '@/components/ProfileHeader';
import type { ProfileMetaItem } from '@/components/ProfileHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { WeeklyReportModal } from '@/components/weekly/WeeklyReportModal';
import { usePermission } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryKeys';
import { PaymentFormModal } from '@/pages/payments/PaymentFormModal';
import { studentsService } from '@/services/students.service';
import { formatDate, formatNumber, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { StudentAttendanceModal } from './StudentAttendanceModal';
import { StudentFormModal } from './StudentFormModal';
import { StudentStatusModal } from './StudentStatusModal';
import { AiAnalysisTab } from './profile/AiAnalysisTab';
import { GroupHistoryTab } from './profile/GroupHistoryTab';
import { MasteryTab } from './profile/MasteryTab';
import { ParentsTab } from './profile/ParentsTab';
import { PaymentScheduleTab } from './profile/PaymentScheduleTab';
import { AchievementsTab, ActivityTab, ExamsTab, HomeworkTab, OverviewTab, PaymentsTab } from './profile/ProfileTabs';

type TabKey = 'overview' | 'mastery' | 'ai' | 'groups' | 'parents' | 'homework' | 'exams' | 'payments' | 'schedule' | 'achievements' | 'activity';
type Dialog = 'calendar' | 'weekly' | 'edit' | 'payment' | 'status' | null;

const BACK = { to: '/students', label: 'O‘quvchilar' };

/**
 * O'quvchi profili ("Student 360"): sarlavhada kim, holati va eng kerakli amallar; pastda bo'limlar.
 * Amallar ro'yxat sahifasidagi bilan bir xil oynalar va ruxsatlar — yangi funksiya yo'q.
 */
export default function StudentProfilePage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const canViewHomework = usePermission(PERMISSIONS.HOMEWORK_VIEW);
  const canViewExams = usePermission(PERMISSIONS.EXAM_VIEW);
  const canUseAi = usePermission(PERMISSIONS.AI_ACADEMIC);
  const canViewAttendance = usePermission(PERMISSIONS.ATTENDANCE_VIEW);
  const canViewParents = usePermission(PERMISSIONS.PARENT_VIEW);
  const canViewDebts = usePermission(PERMISSIONS.DEBT_VIEW);
  const canViewPayments = usePermission(PERMISSIONS.PAYMENT_VIEW);
  const canManageStudents = usePermission(PERMISSIONS.STUDENT_MANAGE);
  const canCreatePayment = usePermission(PERMISSIONS.PAYMENT_CREATE);
  const [tab, setTab] = useState<TabKey>('overview');
  const [dialog, setDialog] = useState<Dialog>(null);

  const profileQuery = useQuery({
    queryKey: queryKeys.students.profile(id),
    queryFn: () => studentsService.profile(id),
    enabled: Boolean(id),
  });

  if (profileQuery.isPending) {
    return (
      <div aria-busy="true" aria-label="Yuklanmoqda">
        <Skeleton className="mb-3 h-5 w-28" />
        <Skeleton className="mb-5 h-48 w-full rounded-card" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (profileQuery.isError) {
    return <ErrorState error={profileQuery.error} retrying={profileQuery.isFetching} onRetry={() => void profileQuery.refetch()} />;
  }

  const profile = profileQuery.data;
  const { student, gamification, attendance } = profile;
  const fullName = `${student.firstName} ${student.lastName}`;
  const debt = student.debt?.remaining ?? 0;

  // Ro'yxat sahifasidagi bilan bir xil kesh yangilanishi
  const saved = () => {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lookups.studentForm });
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
  };

  const meta: ProfileMetaItem[] = [
    { name: 'ID raqam', icon: Hash, label: <span className="font-mono">{student.code}</span> },
    { name: 'Kurs', icon: BookOpen, label: student.course.name },
    ...(student.group ? [{ name: 'Guruh', icon: Layers, label: student.group.name }] : []),
    { name: 'Telefon', icon: Phone, label: formatPhone(student.phone) },
    { name: 'O‘qish boshlangan', icon: CalendarDays, label: `${formatDate(student.startDate)} dan` },
    ...(student.referralCode ? [{ name: 'Taklif kodi', icon: Gift, label: <span className="font-mono">{student.referralCode}</span> }] : []),
  ];

  const tabs: ReadonlyArray<{ value: TabKey; label: string; icon: LucideIcon }> = [
    { value: 'overview', label: 'Umumiy', icon: LayoutDashboard },
    { value: 'mastery', label: 'O‘zlashtirish', icon: Target },
    ...(canUseAi ? [{ value: 'ai' as const, label: 'AI tahlil', icon: Bot }] : []),
    { value: 'groups', label: 'Guruh tarixi', icon: ArrowLeftRight },
    ...(canViewParents ? [{ value: 'parents' as const, label: 'Ota-ona', icon: UsersRound }] : []),
    ...(canViewHomework ? [{ value: 'homework' as const, label: 'Uy vazifasi', icon: BookOpenCheck }] : []),
    ...(canViewExams ? [{ value: 'exams' as const, label: 'Imtihonlar', icon: FileCheck }] : []),
    ...(profile.payments ? [{ value: 'payments' as const, label: 'To‘lovlar', icon: Wallet }] : []),
    ...(canViewDebts || canViewPayments ? [{ value: 'schedule' as const, label: 'To‘lov jadvali', icon: CalendarClock }] : []),
    { value: 'achievements', label: 'Yutuqlar', icon: Award },
    { value: 'activity', label: 'Faollik', icon: History },
  ];

  const moreActions = [
    ...(canViewAttendance ? [{ label: 'Davomat kalendari', icon: CalendarCheck, onSelect: () => setDialog('calendar') }] : []),
    ...(canManageStudents ? [{ label: 'Holatni o‘zgartirish', icon: RefreshCw, onSelect: () => setDialog('status') }] : []),
  ];

  return (
    <>
      <ProfileHeader
        back={BACK}
        firstName={student.firstName}
        lastName={student.lastName}
        title={fullName}
        badges={
          <>
            <StatusBadge kind="student" status={student.status} />
            {student.riskLevel && <StatusBadge kind="risk" status={student.riskLevel} />}
          </>
        }
        meta={meta}
        actions={
          <>
            {canCreatePayment && debt > 0 && (
              <Button leftIcon={<Wallet className="size-4" aria-hidden />} onClick={() => setDialog('payment')}>
                To‘lov qabul qilish
              </Button>
            )}
            <Button variant="secondary" leftIcon={<FileBarChart className="size-4" aria-hidden />} onClick={() => setDialog('weekly')}>
              Haftalik hisobot
            </Button>
            {canManageStudents && (
              <Button variant="secondary" leftIcon={<Pencil className="size-4" aria-hidden />} onClick={() => setDialog('edit')}>
                Tahrirlash
              </Button>
            )}
            <ActionMenu label={`${fullName} — boshqa amallar`} trigger={{ label: 'Yana', icon: MoreHorizontal }} items={moreActions} />
          </>
        }
        stats={
          <>
            <ProfileStat
              label="Daraja"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {gamification.level.icon ? <span aria-hidden>{gamification.level.icon}</span> : <Star className="size-4 text-warning" aria-hidden />}
                  {gamification.level.number}
                </span>
              }
              hint={gamification.level.name}
            >
              <span className="mt-1.5 block h-1.5 max-w-44 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <span className="block h-full rounded-full bg-chart-brand" style={{ width: `${Math.max(gamification.progress, 2)}%` }} />
              </span>
              <span className="mt-1 block text-caption text-fg-muted">
                {formatNumber(gamification.totalXp)} XP
                {gamification.nextLevel && ` · keyingisiga ${formatNumber(gamification.nextLevel.xpLeft)}`}
              </span>
            </ProfileStat>
            <ProfileStat label="Reyting" value={gamification.rank ? `#${gamification.rank}` : '—'} />
            <ProfileStat
              label="Davomat"
              value={attendance.total ? `${attendance.rate}%` : '—'}
              tone={!attendance.total ? 'default' : attendance.rate >= 85 ? 'success' : 'warning'}
              hint={attendance.total ? `${formatNumber(attendance.total)} dars` : undefined}
            />
            <ProfileStat
              label="Seriya"
              value={
                <span className="inline-flex items-center gap-1">
                  <Flame className="size-4 text-warning" aria-hidden />
                  {gamification.streak.current}
                </span>
              }
              hint="kun ketma-ket"
            />
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabList label="Profil bo‘limlari" className="mb-4">
          {tabs.map(({ value, label, icon: Icon }) => (
            <Tab key={value} value={value} icon={<Icon className="size-4" aria-hidden />}>
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="overview">
          <OverviewTab profile={profile} onOpenCalendar={() => canViewAttendance && setDialog('calendar')} />
        </TabPanel>
        <TabPanel value="mastery">
          <MasteryTab studentId={student.id} />
        </TabPanel>
        <TabPanel value="ai">
          <AiAnalysisTab studentId={student.id} />
        </TabPanel>
        <TabPanel value="groups">
          <GroupHistoryTab student={student} canManage={canManageStudents} />
        </TabPanel>
        <TabPanel value="parents">
          <ParentsTab student={{ id: student.id, name: fullName }} />
        </TabPanel>
        <TabPanel value="homework">
          <HomeworkTab studentId={student.id} />
        </TabPanel>
        <TabPanel value="exams">
          <ExamsTab studentId={student.id} />
        </TabPanel>
        <TabPanel value="payments">
          <PaymentsTab studentId={student.id} />
        </TabPanel>
        <TabPanel value="schedule">
          <PaymentScheduleTab studentId={student.id} startDate={student.startDate} />
        </TabPanel>
        <TabPanel value="achievements">
          <AchievementsTab profile={profile} />
        </TabPanel>
        <TabPanel value="activity">
          <ActivityTab profile={profile} />
        </TabPanel>
      </Tabs>

      {dialog === 'calendar' && <StudentAttendanceModal student={student} onClose={() => setDialog(null)} />}
      {dialog === 'weekly' && <WeeklyReportModal studentId={student.id} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <StudentFormModal student={student} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog === 'status' && <StudentStatusModal student={student} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog === 'payment' && <PaymentFormModal student={student} onClose={() => setDialog(null)} onSaved={saved} />}
    </>
  );
}
