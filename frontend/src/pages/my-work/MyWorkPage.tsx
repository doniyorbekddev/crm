import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, FileCheck2, ListTodo, MessageSquareWarning, Plus, Siren, Stamp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { TaskFormModal } from '@/pages/tasks/TaskFormModal';
import { myWorkService } from '@/services/myWork.service';
import type { MyWorkSection, MyWorkSectionKey } from '@/types/myWork';
import { formatDateTime } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const SECTION_ICONS: Record<MyWorkSectionKey, LucideIcon> = {
  tasks: ListTodo,
  followUps: CalendarClock,
  approvals: Stamp,
  alerts: Siren,
  homework: FileCheck2,
  examReviews: ClipboardCheck,
  attendance: ClipboardList,
  feedback: MessageSquareWarning,
};

function SectionCard({ section }: { section: MyWorkSection }) {
  const Icon = SECTION_ICONS[section.key];
  return (
    <Card>
      <section aria-label={section.title} className="p-4">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-label font-semibold text-fg">
            <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
            <span className="truncate">{section.title}</span>
            <Badge tone={section.count === 0 ? 'gray' : 'blue'}>{section.count}</Badge>
            {section.overdue > 0 && <Badge tone="red">{section.overdue} ta kechikkan</Badge>}
          </h2>
          <Link to={section.link} className="inline-flex shrink-0 items-center gap-1 text-caption text-primary hover:underline" aria-label={`${section.title} — hammasi`}>
            Hammasi
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </header>
        {section.items.length === 0 ? (
          <p className="text-caption text-fg-subtle">Kutilayotgan ish yo‘q</p>
        ) : (
          <ul className="divide-y divide-border">
            {section.items.map((item) => (
              <li key={item.id} className="py-2">
                <p className="text-body font-medium text-fg">
                  {item.link ? (
                    <Link to={item.link} className="hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </p>
                <p className="text-caption text-fg-subtle">
                  {[item.subtitle, item.dueAt ? `Muddat: ${formatDateTime(item.dueAt)}` : null].filter(Boolean).join(' · ')}
                  {item.overdue && <span className="ml-1 text-danger">· muddati o‘tgan</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
        {section.count > section.items.length && section.items.length > 0 && (
          <p className="mt-2 text-caption text-fg-subtle">Yana {section.count - section.items.length} ta — “Hammasi” orqali</p>
        )}
      </section>
    </Card>
  );
}

/** "Ishlarim" markazi (CRM 4.0): xodimning o'zi qilishi kerak bo'lgan barcha ishlari bitta sahifada */
export default function MyWorkPage() {
  const canCreate = usePermission(PERMISSIONS.TASK_CREATE);
  const canAssign = usePermission(PERMISSIONS.TASK_ASSIGN);
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ['my-work'], queryFn: () => myWorkService.get(), refetchInterval: 60_000 });

  return (
    <div>
      <PageHeader
        title="Ishlarim"
        description={query.data ? (query.data.total === 0 ? 'Kutilayotgan ish yo‘q' : `${query.data.total} ta ish kutmoqda${query.data.overdue ? `, ${query.data.overdue} tasi kechikkan` : ''}`) : 'Vazifalar, follow-up, tasdiqlar va darslar bir joyda'}
        actions={
          canCreate ? (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              Yangi vazifa
            </Button>
          ) : undefined
        }
      />
      {query.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.total === 0 && (
            <Card className="mb-4">
              <EmptyState icon={CheckCircle2} title="Hammasi bajarilgan" description="Sizga biriktirilgan kutilayotgan ish yo‘q" />
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {query.data.sections.map((section) => (
              <SectionCard key={section.key} section={section} />
            ))}
          </div>
        </>
      )}
      {creating && <TaskFormModal open onClose={() => setCreating(false)} canAssign={canAssign} />}
    </div>
  );
}
