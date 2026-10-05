import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, BookOpen, CalendarDays, ClipboardCheck, Clock, FileCheck, Layers, ListChecks, Pencil, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProfileHeader, ProfileStat } from '@/components/ProfileHeader';
import type { ProfileMetaItem } from '@/components/ProfileHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { usePermission } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryKeys';
import { examsService } from '@/services/homework.service';
import type { ExamDetail } from '@/types/homework';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import { EXAM_TYPE_LABELS } from '@/utils/homeworkLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { ExamFormModal } from './ExamFormModal';
import { ExamQuestionsModal } from './ExamQuestionsModal';
import { ExamResultsModal } from './ExamResultsModal';

type TabKey = 'results' | 'analytics';
type Dialog = 'results' | 'questions' | 'edit' | null;

const BACK = { to: '/exams', label: 'Imtihonlar' };

/** Natija foizi oraliqlari — taqsimot shu oraliqlar bo'yicha sanaladi */
const BANDS = [
  { label: '85–100%', from: 85, className: 'bg-chart-positive' },
  { label: '70–84%', from: 70, className: 'bg-chart-brand' },
  { label: '50–69%', from: 50, className: 'bg-chart-warning' },
  { label: '0–49%', from: 0, className: 'bg-chart-negative' },
] as const;

/** Baholangan natijalar taqsimoti — imtihon javobidagi `results` dan hisoblanadi (qo'shimcha so'rov yo'q) */
function AnalyticsTab({ exam }: { exam: ExamDetail }) {
  const graded = exam.results.filter((result) => result.percentage !== null);
  if (graded.length === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="Tahlil uchun natija yo‘q" description="Kamida bitta o‘quvchi baholangach taqsimot ko‘rinadi" />
      </Card>
    );
  }
  const counts = BANDS.map((band, index) => {
    const upper = index === 0 ? 101 : BANDS[index - 1]!.from;
    return { ...band, count: graded.filter((result) => result.percentage! >= band.from && result.percentage! < upper).length };
  });
  const notGraded = exam.results.length - graded.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Natijalar taqsimoti</CardTitle>
        <span className="text-caption text-fg-muted tabular-nums">{formatNumber(graded.length)} ta baholangan</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {counts.map((band) => {
          const share = Math.round((band.count / graded.length) * 100);
          return (
            <div key={band.label}>
              <div className="flex items-baseline justify-between gap-3 text-body">
                <span className="text-fg">{band.label}</span>
                <span className="text-fg-muted tabular-nums">
                  {formatNumber(band.count)} ta · {share}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${band.label}: ${band.count} ta, ${share}%`}>
                <div className={`h-full rounded-full ${band.className}`} style={{ width: `${share}%` }} />
              </div>
            </div>
          );
        })}
        {notGraded > 0 && <p className="text-caption text-fg-muted">{formatNumber(notGraded)} ta o‘quvchi hali baholanmagan.</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Imtihon sahifasi: kim, qachon, qanday natija. Ma'lumot `exams/:id` dan;
 * natija kiritish, savollar va tahrirlash — ro'yxatdagi oynalarning o'zi.
 */
export default function ExamPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.EXAM_MANAGE);
  const canGrade = usePermission(PERMISSIONS.EXAM_GRADE);
  const [tab, setTab] = useState<TabKey>('results');
  const [dialog, setDialog] = useState<Dialog>(null);

  const query = useQuery({ queryKey: queryKeys.exams.detail(id), queryFn: () => examsService.detail(id), enabled: Boolean(id) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.exams.all });

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Yuklanmoqda">
        <Skeleton className="mb-3 h-5 w-24" />
        <Skeleton className="mb-5 h-44 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />;
  }

  const exam = query.data;
  const hasGrades = exam.stats.graded > 0;

  const meta: ProfileMetaItem[] = [
    { name: 'Guruh', icon: Layers, label: exam.group.name },
    ...(exam.course ? [{ name: 'Kurs', icon: BookOpen, label: exam.course.name }] : []),
    { name: 'Sana', icon: CalendarDays, label: formatDate(exam.date) },
    ...(exam.durationMinutes ? [{ name: 'Davomiyligi', icon: Clock, label: `${exam.durationMinutes} daqiqa` }] : []),
    ...(exam.teacher ? [{ name: 'O‘qituvchi', icon: UserRound, label: `${exam.teacher.firstName} ${exam.teacher.lastName}` }] : []),
  ];

  return (
    <>
      <ProfileHeader
        back={BACK}
        icon={FileCheck}
        title={exam.title}
        badges={
          <>
            <StatusBadge kind="exam" status={exam.status} />
            {exam.isOnline && <Badge tone="purple">Onlayn</Badge>}
            <Badge>{EXAM_TYPE_LABELS[exam.type]}</Badge>
          </>
        }
        meta={meta}
        actions={
          <>
            <Button leftIcon={<ClipboardCheck className="size-4" aria-hidden />} onClick={() => setDialog('results')}>
              {canGrade ? 'Natija kiritish' : 'Natijalar'}
            </Button>
            <Button variant="secondary" leftIcon={<ListChecks className="size-4" aria-hidden />} onClick={() => setDialog('questions')}>
              Savollar va tahlil
            </Button>
            {canManage && (
              <Button variant="secondary" leftIcon={<Pencil className="size-4" aria-hidden />} onClick={() => setDialog('edit')}>
                Tahrirlash
              </Button>
            )}
          </>
        }
        stats={
          <>
            <ProfileStat label="Baholangan" value={formatNumber(exam.stats.graded)} hint={`/ ${formatNumber(exam.stats.students)} o‘quvchi`} />
            <ProfileStat label="O‘rtacha" value={hasGrades ? `${exam.stats.averagePercentage}%` : '—'} hint={hasGrades ? `${formatNumber(exam.stats.averageScore)} / ${exam.maxScore} ball` : undefined} />
            <ProfileStat
              label="O‘tganlar"
              value={hasGrades && exam.passScore !== null ? `${exam.stats.passRate}%` : '—'}
              tone={hasGrades && exam.passScore !== null ? (exam.stats.passRate >= 70 ? 'success' : 'warning') : 'default'}
              hint={exam.passScore !== null ? `o‘tish bali ${exam.passScore}` : 'o‘tish bali belgilanmagan'}
            />
            <ProfileStat label="Eng yuqori / past" value={hasGrades ? `${formatNumber(exam.stats.highest)} / ${formatNumber(exam.stats.lowest)}` : '—'} hint="ball" />
          </>
        }
      />
      {exam.description && <p className="-mt-2 mb-4 max-w-3xl text-body text-fg-muted">{exam.description}</p>}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabList label="Imtihon bo‘limlari" className="mb-4">
          <Tab value="results" icon={<ClipboardCheck className="size-4" aria-hidden />} count={exam.results.length}>
            Natijalar
          </Tab>
          <Tab value="analytics" icon={<BarChart3 className="size-4" aria-hidden />}>
            Tahlil
          </Tab>
        </TabList>
        <TabPanel value="results">
          <DataTable
            label="Imtihon natijalari"
            rows={exam.results}
            rowKey={(row) => row.studentId}
            empty={{ icon: ClipboardCheck, title: 'Guruhda faol o‘quvchi yo‘q', description: 'O‘quvchi qo‘shilgach natija kiritish mumkin bo‘ladi' }}
            mobileLayout="cards"
            columns={[
              {
                key: 'student',
                label: 'O‘quvchi',
                cell: (row) => (
                  <>
                    <p className="font-medium text-fg">
                      {row.firstName} {row.lastName}
                    </p>
                    <p className="font-mono text-caption text-fg-subtle">{row.code}</p>
                  </>
                ),
              },
              { key: 'score', label: 'Ball', align: 'right', tdClassName: 'text-fg', cell: (row) => (row.score === null ? '—' : `${formatNumber(row.score)} / ${exam.maxScore}`) },
              { key: 'percentage', label: 'Foiz', align: 'right', tdClassName: 'text-fg-muted', cell: (row) => (row.percentage === null ? '—' : `${row.percentage}%`) },
              { key: 'grade', label: 'Baho', tdClassName: 'text-fg-muted', cell: (row) => row.grade ?? '—' },
              {
                key: 'passed',
                label: 'Natija',
                cell: (row) =>
                  row.passed === null ? <span className="text-fg-subtle">—</span> : <Badge tone={row.passed ? 'success' : 'danger'}>{row.passed ? 'O‘tdi' : 'O‘tmadi'}</Badge>,
              },
              {
                key: 'gradedAt',
                label: 'Baholangan',
                tdClassName: 'whitespace-nowrap text-fg-muted',
                cell: (row) => (row.gradedAt ? formatDateTime(row.gradedAt) : '—'),
              },
            ]}
          />
        </TabPanel>
        <TabPanel value="analytics">
          <AnalyticsTab exam={exam} />
        </TabPanel>
      </Tabs>

      {dialog === 'results' && <ExamResultsModal examId={exam.id} onClose={() => setDialog(null)} onChanged={refresh} />}
      {dialog === 'questions' && <ExamQuestionsModal exam={exam} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && (
        <ExamFormModal
          exam={exam}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
