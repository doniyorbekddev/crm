import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpenCheck,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  FileCheck,
  GraduationCap,
  Layers,
  Mail,
  Phone,
  Smile,
  TrendingUp,
  UserCheck,
  Wallet,
  Wallet2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProfileHeader, ProfileStat } from '@/components/ProfileHeader';
import type { ProfileMetaItem } from '@/components/ProfileHeader';
import { AttendanceSection, ExamSection, HomeworkSection, TeacherStudentsSection } from '@/components/academic/ScopedSections';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { usePermission } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';
import type { TeacherDetail } from '@/types/teacher';
import { WEEK_DAY_LABELS, WEEK_DAY_ORDER, formatSchedule } from '@/utils/courseLabels';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { TeacherTrendChart } from './TeacherTrendChart';
import { SALARY_TYPE_LABELS, salaryRuleSummary } from '@/utils/teacherLabels';

type TabKey = 'performance' | 'groups' | 'students' | 'schedule' | 'attendance' | 'homework' | 'exams' | 'salary';

const BACK = { to: '/teachers', label: 'O‘qituvchilar' };

/** Joriy oy ko'rsatkichlari — faqat API hisoblagan qiymatlar */
function PerformanceTab({ teacher }: { teacher: TeacherDetail }) {
  const { performance } = teacher;
  return (
    <section aria-label={`${performance.label} ko‘rsatkichlari`}>
      <h2 className="mb-2 text-overline text-fg-subtle uppercase">{performance.label} ko‘rsatkichlari</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          size="sm"
          icon={CalendarCheck}
          title="O‘tkazilgan darslar"
          value={formatNumber(performance.lessonsHeld)}
          {...(performance.lessonsCancelled > 0 ? { description: `${performance.lessonsCancelled} ta bekor qilingan` } : {})}
        />
        <StatCard
          size="sm"
          icon={UserCheck}
          title="Davomat"
          value={`${performance.attendanceRate}%`}
          description={`${formatNumber(performance.attendance.total)} ta belgi · ${formatNumber(performance.attendance.absent)} yo‘q`}
          tone={performance.attendance.total === 0 ? 'neutral' : performance.attendanceRate >= 85 ? 'success' : 'warning'}
        />
        <StatCard size="sm" icon={ClipboardList} title="Uy vazifasi / imtihon" value={`${formatNumber(performance.homework)} / ${formatNumber(performance.exams)}`} />
        <StatCard size="sm" icon={Wallet} title="Guruhlaridan tushum" value={formatMoney(performance.revenue)} tone="success" />
        <StatCard
          size="sm"
          icon={GraduationCap}
          title="O‘quvchilar"
          value={formatNumber(performance.studentCount)}
          {...(performance.retentionRate === null ? {} : { description: `${performance.retentionRate}% ushlab qolish` })}
          tone="primary"
        />
        <StatCard
          size="sm"
          icon={TrendingUp}
          title="Uy vazifasi topshirilishi"
          value={performance.homeworkCompletionRate === null ? '—' : `${performance.homeworkCompletionRate}%`}
          {...(performance.homeworkCompletionRate === null ? { description: 'Bu oyda vazifa berilmagan' } : {})}
        />
        <StatCard size="sm" icon={BarChart3} title="Imtihon o‘rtachasi" value={performance.examAveragePercent === null ? '—' : `${performance.examAveragePercent}%`} />
        <StatCard
          size="sm"
          icon={Smile}
          title="O‘quvchilar bahosi"
          value={performance.satisfaction.average === null ? '—' : `${performance.satisfaction.average} / 5`}
          description={performance.satisfaction.responses > 0 ? `${formatNumber(performance.satisfaction.responses)} ta fikr` : 'Fikr yo‘q'}
        />
      </div>
      {teacher.bio && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>O‘qituvchi haqida</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body whitespace-pre-line text-fg">{teacher.bio}</p>
          </CardContent>
        </Card>
      )}
      <TeacherTrendChart teacherId={teacher.id} />
    </section>
  );
}

function GroupsTab({ teacher }: { teacher: TeacherDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Guruhlari</CardTitle>
        <span className="text-caption text-fg-muted tabular-nums">{teacher.groupList.length} ta</span>
      </CardHeader>
      <CardContent className="p-0">
        {teacher.groupList.length === 0 ? (
          <EmptyState size="sm" icon={Layers} title="Guruh biriktirilmagan" description="Guruh tahririda shu o‘qituvchini tanlang" />
        ) : (
          <ul className="divide-y divide-border">
            {teacher.groupList.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-fg">
                    {group.name} <span className="font-normal text-fg-muted">· {group.course.name}</span>
                  </p>
                  <p className="text-caption text-fg-muted">
                    {formatSchedule(group.scheduleDays, group.startTime, group.endTime)}
                    {group.room && ` · ${group.room}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-caption text-fg-muted tabular-nums">
                    <GraduationCap className="size-3.5" aria-hidden />
                    <span className="sr-only">O‘quvchilar:</span>
                    {formatNumber(group.students)}
                  </span>
                  <StatusBadge kind="group" status={group.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SalaryTab({ teacher, canViewSalary }: { teacher: TeacherDetail; canViewSalary: boolean }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Maosh modeli</CardTitle>
        </CardHeader>
        <CardContent>
          {!teacher.salaryVisible ? (
            <p className="text-body text-fg-muted">Maosh ma’lumotlarini ko‘rish uchun ruxsat yo‘q</p>
          ) : teacher.salaryRule ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-body text-fg">
                <Badge tone="primary">{SALARY_TYPE_LABELS[teacher.salaryRule.type]}</Badge>
                {canViewSalary && <span className="text-fg-muted">{salaryRuleSummary(teacher.salaryRule)}</span>}
              </p>
              <p className="mt-2 text-caption text-fg-muted">
                {formatDate(teacher.salaryRule.effectiveFrom)} dan amalda
                {teacher.salaryRule.bonus > 0 && ` · oylik bonus ${formatMoney(teacher.salaryRule.bonus)}`}
              </p>
            </>
          ) : (
            <p className="text-body text-fg-muted">Belgilanmagan — maosh hisoblanmaydi</p>
          )}
          {canViewSalary && teacher.salaryTotals && (
            <p className="mt-3 text-body text-fg">
              {teacher.salaryTotals.year}-yil: to‘langan <span className="font-medium tabular-nums">{formatMoney(teacher.salaryTotals.paid)}</span> · qolgan{' '}
              <span className="font-medium tabular-nums">{formatMoney(teacher.salaryTotals.remaining)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {canViewSalary && (
        <Card>
          <CardHeader>
            <CardTitle>Maosh tarixi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {teacher.salaryPeriods.length === 0 ? (
              <EmptyState size="sm" icon={Wallet2} title="Hozircha maosh hisoblanmagan" description="Hisoblangan oylar shu yerda ko‘rinadi" />
            ) : (
              <ul className="divide-y divide-border">
                {teacher.salaryPeriods.map((period) => (
                  <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-fg">{period.label}</p>
                      <p className="text-caption text-fg-muted">
                        {SALARY_TYPE_LABELS[period.salaryType]} · {formatNumber(period.lessonsCount)} dars · {formatNumber(period.studentsCount)} o‘quvchi
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge kind="salary" status={period.status} />
                      <div className="text-right">
                        <p className="text-body font-medium text-fg tabular-nums">{formatMoney(period.totalAmount)}</p>
                        {period.remainingAmount > 0 && <p className="text-caption text-warning tabular-nums">qolgan {formatMoney(period.remainingAmount)}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Haftalik jadval: faol guruhlar kunlar bo'yicha, vaqt tartibida (ma'lumot guruhlar ro'yxatidan) */
function ScheduleTab({ teacher }: { teacher: TeacherDetail }) {
  const active = teacher.groupList.filter((group) => group.status === 'ACTIVE' || group.status === 'PLANNED');
  const days = WEEK_DAY_ORDER.map((day) => ({
    day,
    lessons: active.filter((group) => group.scheduleDays.includes(day)).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((item) => item.lessons.length > 0);

  if (days.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="Jadval bo‘sh" description="Faol yoki rejalashtirilgan guruh biriktirilmagan" />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Haftalik jadval</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border">
        {days.map(({ day, lessons }) => (
          <li key={day} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:gap-6">
            <p className="w-28 shrink-0 text-label text-fg">{WEEK_DAY_LABELS[day]}</p>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {lessons.map((group) => (
                <li key={group.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
                  <span className="font-medium whitespace-nowrap text-fg tabular-nums">
                    {group.startTime}–{group.endTime}
                  </span>
                  <Link to={`/groups/${group.id}`} className="focus-ring rounded-chip text-fg hover:text-primary hover:underline">
                    {group.name}
                  </Link>
                  <span className="text-caption text-fg-muted">
                    {group.course.name}
                    {group.room ? ` · ${group.room}-xona` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * O'qituvchi profili — to'liq sahifa (oldin modal edi). Ma'lumot bitta `teachers/:id` so'rovidan;
 * maosh bo'limi `salary.view` ruxsatiga bog'liq (backend ham shuni tekshiradi).
 */
export default function TeacherProfilePage() {
  const { id = '' } = useParams();
  const canViewSalary = usePermission(PERMISSIONS.SALARY_VIEW);
  const canViewAttendance = usePermission(PERMISSIONS.ATTENDANCE_VIEW);
  const canViewStudents = usePermission(PERMISSIONS.STUDENT_VIEW);
  const canViewHomework = usePermission(PERMISSIONS.HOMEWORK_VIEW);
  const canViewExams = usePermission(PERMISSIONS.EXAM_VIEW);
  const [tab, setTab] = useState<TabKey>('performance');

  const detailQuery = useQuery({
    queryKey: queryKeys.teachers.detail(id),
    queryFn: () => teachersService.detail(id),
    enabled: Boolean(id),
  });

  if (detailQuery.isPending) {
    return (
      <div aria-busy="true" aria-label="Yuklanmoqda">
        <Skeleton className="mb-3 h-5 w-28" />
        <Skeleton className="mb-5 h-44 w-full rounded-card" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return <ErrorState error={detailQuery.error} retrying={detailQuery.isFetching} onRetry={() => void detailQuery.refetch()} />;
  }

  const teacher = detailQuery.data;
  const fullName = `${teacher.user.firstName} ${teacher.user.lastName}`;

  const meta: ProfileMetaItem[] = [
    { name: 'Lavozim', icon: Briefcase, label: teacher.user.roleName },
    { name: 'Email', icon: Mail, label: teacher.user.email },
    ...(teacher.user.phone ? [{ name: 'Telefon', icon: Phone, label: formatPhone(teacher.user.phone) }] : []),
    ...(teacher.hireDate ? [{ name: 'Ishga kirgan', icon: CalendarDays, label: `${formatDate(teacher.hireDate)} dan` }] : []),
  ];

  return (
    <>
      <ProfileHeader
        back={BACK}
        firstName={teacher.user.firstName}
        lastName={teacher.user.lastName}
        title={fullName}
        badges={
          <>
            <Badge tone={teacher.isActive ? 'success' : 'neutral'}>{teacher.isActive ? 'Faol' : 'Faolsiz'}</Badge>
            {teacher.employmentStatus !== 'ACTIVE' && <StatusBadge kind="employee" status={teacher.employmentStatus} />}
          </>
        }
        meta={meta}
        stats={
          <>
            <ProfileStat label="Mutaxassislik" value={<span className="text-body font-medium">{teacher.specialization ?? 'Ko‘rsatilmagan'}</span>} />
            <ProfileStat label="Tajriba" value={teacher.experienceYears === null ? '—' : teacher.experienceYears} hint={teacher.experienceYears === null ? undefined : 'yil'} />
            <ProfileStat label="Guruhlar" value={formatNumber(teacher.groups)} />
            <ProfileStat label="O‘quvchilar" value={formatNumber(teacher.students)} hint={`shu oyda ${formatNumber(teacher.lessonsThisMonth)} dars`} />
          </>
        }
      />
      {teacher.terminationDate && <p className="-mt-2 mb-4 text-body text-fg-muted">{formatDate(teacher.terminationDate)} da ishdan ketgan</p>}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabList label="O‘qituvchi bo‘limlari" className="mb-4">
          <Tab value="performance" icon={<BarChart3 className="size-4" aria-hidden />}>
            Ko‘rsatkichlar
          </Tab>
          <Tab value="groups" icon={<Layers className="size-4" aria-hidden />} count={teacher.groupList.length}>
            Guruhlar
          </Tab>
          {canViewStudents && (
            <Tab value="students" icon={<GraduationCap className="size-4" aria-hidden />} count={teacher.students}>
              O‘quvchilar
            </Tab>
          )}
          <Tab value="schedule" icon={<Clock className="size-4" aria-hidden />}>
            Jadval
          </Tab>
          {canViewAttendance && (
            <Tab value="attendance" icon={<CalendarCheck className="size-4" aria-hidden />}>
              Davomat
            </Tab>
          )}
          {canViewHomework && (
            <Tab value="homework" icon={<BookOpenCheck className="size-4" aria-hidden />}>
              Uy vazifalari
            </Tab>
          )}
          {canViewExams && (
            <Tab value="exams" icon={<FileCheck className="size-4" aria-hidden />}>
              Imtihonlar
            </Tab>
          )}
          <Tab value="salary" icon={<Wallet2 className="size-4" aria-hidden />}>
            Maosh
          </Tab>
        </TabList>
        <TabPanel value="performance">
          <PerformanceTab teacher={teacher} />
        </TabPanel>
        <TabPanel value="groups">
          <GroupsTab teacher={teacher} />
        </TabPanel>
        <TabPanel value="students">
          <TeacherStudentsSection teacherId={teacher.user.id} />
        </TabPanel>
        <TabPanel value="schedule">
          <ScheduleTab teacher={teacher} />
        </TabPanel>
        <TabPanel value="attendance">
          <AttendanceSection scope={{ teacherId: teacher.user.id }} />
        </TabPanel>
        <TabPanel value="homework">
          <HomeworkSection scope={{ teacherId: teacher.user.id }} />
        </TabPanel>
        <TabPanel value="exams">
          <ExamSection scope={{ teacherId: teacher.user.id }} />
        </TabPanel>
        <TabPanel value="salary">
          <SalaryTab teacher={teacher} canViewSalary={canViewSalary} />
        </TabPanel>
      </Tabs>
    </>
  );
}
