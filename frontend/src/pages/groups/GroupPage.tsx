import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, BookOpenCheck, Bot, CalendarCheck, Clock, DoorOpen, FileCheck, Layers, Lock, Pencil, Target, UserRound, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProfileHeader, ProfileStat } from '@/components/ProfileHeader';
import type { ProfileMetaItem } from '@/components/ProfileHeader';
import { Button } from '@/components/ui/Button';
import { AttendanceSection, ExamSection, HomeworkSection } from '@/components/academic/ScopedSections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Table';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { usePermission } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryKeys';
import { GroupAiModal } from '@/pages/teaching/GroupAiModal';
import { groupsService } from '@/services/groups.service';
import { teachingService } from '@/services/teaching.service';
import { formatSchedule } from '@/utils/courseLabels';
import { formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GroupFormModal } from './GroupFormModal';
import { GroupMasteryMatrix } from './GroupMasteryMatrix';
import { GroupMasteryModal } from './GroupMasteryModal';
import { GroupStudentsTable } from './GroupStudentsTable';

type Dialog = 'edit' | 'mastery' | 'ai' | null;
type TabKey = 'students' | 'attendance' | 'homework' | 'exams' | 'progress';

const BACK = { to: '/groups', label: 'Guruhlar' };
/** O'quvchilar ko'rsatkichlari (`/teaching/groups/:id`) shu ruxsatlardan biri bilan ochiladi — backend bilan bir xil */
const TEACHING_ACCESS = [PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.HOMEWORK_MANAGE, PERMISSIONS.GROUP_MANAGE] as const;

/** O'quvchilar jadvali — alohida so'rov: ruxsat bo'lmasa umuman yuborilmaydi */
function StudentsCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const query = useQuery({ queryKey: queryKeys.teaching.group(groupId), queryFn: () => teachingService.group(groupId) });
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <CardTitle>O‘quvchilar</CardTitle>
        {query.data && <span className="text-caption text-fg-muted tabular-nums">{query.data.students.length} ta</span>}
      </CardHeader>
      {query.isPending ? (
        <TableSkeleton rows={5} columns={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : (
        <GroupStudentsTable students={query.data.students} label={`${groupName} o‘quvchilari`} />
      )}
    </Card>
  );
}

/**
 * Guruh sahifasi: kim o'qitadi, qachon va qayerda, nechta o'rin; o'quvchilar ko'rsatkichlari.
 * Ma'lumot mavjud API'dan (`groups/:id`, `teaching/groups/:id`); amallar — ro'yxatdagi oynalar va ruxsatlar.
 */
export default function GroupPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.GROUP_MANAGE);
  const canUseAi = usePermission(PERMISSIONS.AI_ACADEMIC);
  const canViewAttendance = usePermission(PERMISSIONS.ATTENDANCE_VIEW);
  const canViewStudents = usePermission(TEACHING_ACCESS);
  const canViewHomework = usePermission(PERMISSIONS.HOMEWORK_VIEW);
  const canViewExams = usePermission(PERMISSIONS.EXAM_VIEW);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<TabKey>('students');

  const groupQuery = useQuery({ queryKey: queryKeys.groups.detail(id), queryFn: () => groupsService.getById(id), enabled: Boolean(id) });

  if (groupQuery.isPending) {
    return (
      <div aria-busy="true" aria-label="Yuklanmoqda">
        <Skeleton className="mb-3 h-5 w-24" />
        <Skeleton className="mb-5 h-44 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }
  if (groupQuery.isError) {
    return <ErrorState error={groupQuery.error} retrying={groupQuery.isFetching} onRetry={() => void groupQuery.refetch()} />;
  }

  const group = groupQuery.data;
  const room = group.roomRef?.name ?? group.room;

  // Bo'limlar ruxsatga qarab — ruxsati yo'q bo'lim umuman ko'rinmaydi (so'rov ham yuborilmaydi)
  const tabs: ReadonlyArray<{ value: TabKey; label: string; icon: LucideIcon }> = [
    { value: 'students', label: 'O‘quvchilar', icon: UsersRound },
    ...(canViewAttendance ? [{ value: 'attendance' as const, label: 'Davomat', icon: CalendarCheck }] : []),
    ...(canViewHomework ? [{ value: 'homework' as const, label: 'Uy vazifalari', icon: BookOpenCheck }] : []),
    ...(canViewExams ? [{ value: 'exams' as const, label: 'Imtihonlar', icon: FileCheck }] : []),
    { value: 'progress', label: 'O‘zlashtirish', icon: Target },
  ];

  const meta: ProfileMetaItem[] = [
    { name: 'Kurs', icon: BookOpen, label: group.course.name },
    { name: 'O‘qituvchi', icon: UserRound, label: group.teacher ? `${group.teacher.firstName} ${group.teacher.lastName}` : 'O‘qituvchi biriktirilmagan' },
    ...(room ? [{ name: 'Xona', icon: DoorOpen, label: `${room}-xona` }] : []),
    { name: 'Jadval', icon: Clock, label: formatSchedule(group.scheduleDays, group.startTime, group.endTime) },
  ];

  return (
    <>
      <ProfileHeader
        back={BACK}
        icon={Layers}
        title={group.name}
        badges={<StatusBadge kind="group" status={group.status} />}
        meta={meta}
        actions={
          <>
            {canViewAttendance && (
              <Link
                to={`/attendance?groupId=${group.id}`}
                className="focus-ring inline-flex h-9 items-center gap-2 rounded-control bg-brand-600 px-3.5 text-body font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                <CalendarCheck className="size-4" aria-hidden />
                Davomat
              </Link>
            )}
            <Button variant="secondary" leftIcon={<Target className="size-4" aria-hidden />} onClick={() => setDialog('mastery')}>
              Mavzular bo‘yicha
            </Button>
            {canUseAi && (
              <Button variant="secondary" leftIcon={<Bot className="size-4" aria-hidden />} onClick={() => setDialog('ai')}>
                AI tahlil
              </Button>
            )}
            {canManage && (
              <Button variant="secondary" leftIcon={<Pencil className="size-4" aria-hidden />} onClick={() => setDialog('edit')}>
                Tahrirlash
              </Button>
            )}
          </>
        }
        stats={
          <>
            <ProfileStat label="O‘quvchilar" value={group.studentCount} hint={`/ ${group.capacity} o‘rin`} />
            <ProfileStat
              label="Bo‘sh o‘rin"
              value={group.freeSeats}
              tone={group.freeSeats === 0 ? 'danger' : 'default'}
              hint={group.freeSeats === 0 ? 'to‘lgan' : undefined}
            />
            <ProfileStat label="Boshlanish" value={<span className="text-body font-medium">{formatDate(group.startDate)}</span>} />
            <ProfileStat label="Tugash" value={<span className="text-body font-medium">{group.endDate ? formatDate(group.endDate) : 'Belgilanmagan'}</span>} />
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabList label="Guruh bo‘limlari" className="mb-4">
          {tabs.map(({ value, label, icon: Icon }) => (
            <Tab key={value} value={value} icon={<Icon className="size-4" aria-hidden />}>
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="students">
          {canViewStudents ? (
            <StudentsCard groupId={group.id} groupName={group.name} />
          ) : (
            <Card>
              <EmptyState
                icon={Lock}
                title="O‘quvchilar ko‘rsatkichlari yopiq"
                description="Davomat, vazifa va xavf ko‘rsatkichlarini dars beradigan yoki guruhlarni boshqaradigan xodim ko‘radi"
              />
            </Card>
          )}
        </TabPanel>
        <TabPanel value="attendance">
          <AttendanceSection scope={{ groupId: group.id }} />
        </TabPanel>
        <TabPanel value="homework">
          <HomeworkSection scope={{ groupId: group.id }} />
        </TabPanel>
        <TabPanel value="exams">
          <ExamSection scope={{ groupId: group.id }} />
        </TabPanel>
        <TabPanel value="progress">
          <Card>
            <CardHeader>
              <CardTitle>Mavzular bo‘yicha o‘zlashtirish</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupMasteryMatrix groupId={group.id} />
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>

      {dialog === 'mastery' && <GroupMasteryModal group={{ id: group.id, name: group.name }} onClose={() => setDialog(null)} />}
      {dialog === 'ai' && <GroupAiModal group={{ id: group.id, name: group.name }} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && (
        <GroupFormModal
          group={group}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
          }}
        />
      )}
    </>
  );
}
