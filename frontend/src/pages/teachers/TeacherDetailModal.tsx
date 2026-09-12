import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';
import type { TeacherDetail } from '@/types/teacher';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { GROUP_STATUS_LABELS, formatSchedule } from '@/utils/courseLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { SALARY_STATUS_LABELS, SALARY_STATUS_TONES, SALARY_TYPE_LABELS, salaryRuleSummary } from '@/utils/teacherLabels';

interface TeacherDetailModalProps {
  teacherId: string;
  onClose: () => void;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

function DetailBody({ teacher, canViewSalary }: { teacher: TeacherDetail; canViewSalary: boolean }) {
  const { performance } = teacher;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium text-fg">
            {teacher.user.firstName} {teacher.user.lastName}
            {!teacher.isActive && (
              <Badge tone="red" className="ml-2">
                Faolsiz
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-muted">
            {teacher.user.email}
            {teacher.user.phone && ` · ${formatPhone(teacher.user.phone)}`}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {teacher.specialization ?? 'Mutaxassislik ko‘rsatilmagan'}
            {teacher.experienceYears !== null && ` · ${teacher.experienceYears} yil tajriba`}
            {teacher.hireDate && ` · ${formatDate(teacher.hireDate)} dan`}
          </p>
          {teacher.bio && <p className="mt-2 text-xs text-fg-muted">{teacher.bio}</p>}
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium text-fg">Maosh modeli</p>
          {teacher.salaryRule ? (
            <>
              <p className="mt-1 flex items-center gap-2 text-sm text-fg">
                <Badge tone="blue">{SALARY_TYPE_LABELS[teacher.salaryRule.type]}</Badge>
                {canViewSalary && <span className="text-xs text-fg-muted">{salaryRuleSummary(teacher.salaryRule)}</span>}
              </p>
              <p className="mt-2 text-xs text-fg-muted">
                {formatDate(teacher.salaryRule.effectiveFrom)} dan amalda
                {teacher.salaryRule.bonus > 0 && ` · oylik bonus ${formatMoney(teacher.salaryRule.bonus)}`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-fg-muted">Belgilanmagan — maosh hisoblanmaydi</p>
          )}
          {canViewSalary && (
            <p className="mt-2 text-xs text-fg-muted">
              {teacher.salaryTotals.year}-yil: to‘langan {formatMoney(teacher.salaryTotals.paid)} · qolgan{' '}
              {formatMoney(teacher.salaryTotals.remaining)}
            </p>
          )}
        </div>
      </div>

      <section>
        <p className="mb-2 text-sm font-medium text-fg">{performance.label} ko‘rsatkichlari</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="O‘tkazilgan darslar"
            value={formatNumber(performance.lessonsHeld)}
            hint={performance.lessonsCancelled > 0 ? `${performance.lessonsCancelled} ta bekor qilingan` : undefined}
          />
          <StatTile
            label="Davomat"
            value={`${performance.attendanceRate}%`}
            hint={`${formatNumber(performance.attendance.total)} ta belgi · ${formatNumber(performance.attendance.absent)} yo‘q`}
          />
          <StatTile
            label="Uy vazifasi / imtihon"
            value={`${formatNumber(performance.homework)} / ${formatNumber(performance.exams)}`}
          />
          <StatTile label="Guruhlaridan tushum" value={formatMoney(performance.revenue)} />
        </div>
      </section>

      <section>
        <p className="mb-2 text-sm font-medium text-fg">Guruhlari ({teacher.groupList.length})</p>
        {teacher.groupList.length === 0 ? (
          <p className="text-sm text-fg-muted">Guruh biriktirilmagan</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {teacher.groupList.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">
                    {group.name} <span className="text-fg-muted">· {group.course.name}</span>
                  </p>
                  <p className="text-xs text-fg-muted">
                    {formatSchedule(group.scheduleDays, group.startTime, group.endTime)}
                    {group.room && ` · ${group.room}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={group.status === 'ACTIVE' ? 'green' : group.status === 'PLANNED' ? 'blue' : 'gray'}>
                    {GROUP_STATUS_LABELS[group.status]}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                    <GraduationCap className="size-3.5" aria-hidden />
                    {formatNumber(group.students)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canViewSalary && (
        <section>
          <p className="mb-2 text-sm font-medium text-fg">Maosh tarixi</p>
          {teacher.salaryPeriods.length === 0 ? (
            <p className="text-sm text-fg-muted">Hozircha maosh hisoblanmagan</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {teacher.salaryPeriods.map((period) => (
                <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{period.label}</p>
                    <p className="text-xs text-fg-muted">
                      {SALARY_TYPE_LABELS[period.salaryType]} · {formatNumber(period.lessonsCount)} dars ·{' '}
                      {formatNumber(period.studentsCount)} o‘quvchi
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={SALARY_STATUS_TONES[period.status]}>{SALARY_STATUS_LABELS[period.status]}</Badge>
                    <div className="text-right">
                      <p className="text-sm font-medium text-fg">{formatMoney(period.totalAmount)}</p>
                      {period.remainingAmount > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          qolgan {formatMoney(period.remainingAmount)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export function TeacherDetailModal({ teacherId, onClose }: TeacherDetailModalProps) {
  const canViewSalary = usePermission(PERMISSIONS.SALARY_VIEW);
  const detailQuery = useQuery({
    queryKey: queryKeys.teachers.detail(teacherId),
    queryFn: () => teachersService.detail(teacherId),
  });

  return (
    <Modal
      open
      title="O‘qituvchi tafsilotlari"
      description={detailQuery.data ? `${detailQuery.data.user.roleName} · ${detailQuery.data.user.email}` : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      {detailQuery.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className={cn('w-full', index === 0 ? 'h-24' : 'h-16')} />
          ))}
        </div>
      ) : detailQuery.isError ? (
        <Alert tone="error">{getErrorMessage(detailQuery.error)}</Alert>
      ) : (
        <DetailBody teacher={detailQuery.data} canViewSalary={canViewSalary} />
      )}
    </Modal>
  );
}
