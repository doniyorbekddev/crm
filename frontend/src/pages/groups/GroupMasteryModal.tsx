import { useQuery } from '@tanstack/react-query';
import { Settings2, Target } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { masteryService } from '@/services/mastery.service';
import { MASTERY_STATUS_LABELS, levelFor, masteryCellClass } from '@/utils/masteryLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { MasterySettingsModal } from './MasterySettingsModal';

/**
 * Guruh o'zlashtirish matritsasi: o'quvchi × mavzu (TZ §26–27). O'qituvchi qaysi mavzu guruh
 * bo'yicha zaif ekanini va kim ortda qolayotganini bir qarashda ko'radi.
 */
export function GroupMasteryModal({ group, onClose }: { group: { id: string; name: string }; onClose: () => void }) {
  const canConfigure = usePermission(PERMISSIONS.SETTINGS_MANAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const query = useQuery({ queryKey: queryKeys.mastery.group(group.id), queryFn: () => masteryService.group(group.id) });

  return (
    <Modal
      open
      size="xl"
      title="Mavzular bo‘yicha o‘zlashtirish"
      description={group.name}
      onClose={onClose}
      footer={
        <>
          {canConfigure && (
            <Button variant="secondary" leftIcon={<Settings2 className="size-4" aria-hidden />} onClick={() => setSettingsOpen(true)}>
              Chegaralar
            </Button>
          )}
          <Button onClick={onClose}>Yopish</Button>
        </>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.topics.length === 0 || query.data.students.length === 0 ? (
        <EmptyState icon={Target} title="Ma’lumot yo‘q" description="Kurs dasturida mavzular va guruhda faol o‘quvchilar bo‘lishi kerak" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium text-fg-muted">
                  O‘quvchi
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium text-fg-muted">
                  O‘rtacha
                </th>
                {query.data.topics.map((topic) => (
                  <th key={topic.id} scope="col" className="min-w-24 px-2 py-2 text-center font-medium text-fg-muted" title={`${topic.moduleTitle} · ${topic.title}`}>
                    <span className="block max-w-28 truncate">{topic.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.students.map((student) => (
                <tr key={student.id} className="border-t border-border">
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1.5 text-left font-normal text-fg">
                    {student.fullName}
                  </th>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums text-fg">{student.overall === null ? '—' : `${student.overall}%`}</td>
                  {query.data.topics.map((topic) => {
                    const cell = student.cells[topic.id]!;
                    const level = levelFor(cell.score, query.data.settings.thresholds);
                    return (
                      <td key={topic.id} className="px-1 py-1 text-center">
                        <span
                          className={cn('inline-block min-w-12 rounded px-1.5 py-0.5 tabular-nums', masteryCellClass(level))}
                          title={`${topic.title}: ${MASTERY_STATUS_LABELS[cell.status]}`}
                        >
                          {cell.score === null ? (cell.status === 'NOT_STARTED' ? '·' : '—') : `${cell.score}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium text-fg-muted">
                  Guruh o‘rtachasi
                </th>
                <td />
                {query.data.topics.map((topic) => (
                  <td key={topic.id} className="px-2 py-2 text-center text-xs text-fg-muted">
                    {topic.average === null ? '—' : `${topic.average}%`}
                    <span className="block">{topic.mastered} o‘zl.</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-fg-subtle">
            “·” — boshlanmagan, “—” — o‘rganilmoqda (hali imtihon/vazifa bahosi yo‘q). Ranglar: qizil — zaif, sariq — rivojlanmoqda, ko‘k — yaxshi, yashil — o‘zlashtirilgan.
          </p>
        </div>
      )}
      {settingsOpen && <MasterySettingsModal onClose={() => setSettingsOpen(false)} />}
    </Modal>
  );
}
