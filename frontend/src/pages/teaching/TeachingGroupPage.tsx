import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bot, Target } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Table';
import { queryKeys } from '@/lib/queryKeys';
import { teachingService } from '@/services/teaching.service';
import { GroupMasteryModal } from '@/pages/groups/GroupMasteryModal';
import { GroupStudentsTable } from '@/pages/groups/GroupStudentsTable';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GroupAiModal } from './GroupAiModal';

/**
 * Guruh jadvali (TZ §28–29): o'quvchi | davomat | vazifa | imtihon | progress | risk | oxirgi faollik.
 * Eng xavflisi tepada; risk sabablari (§29) qatorning o'zida.
 */
export default function TeachingGroupPage() {
  const { id = '' } = useParams();
  const [masteryOpen, setMasteryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const canUseAi = usePermission(PERMISSIONS.AI_ACADEMIC);
  const query = useQuery({ queryKey: queryKeys.teaching.group(id), queryFn: () => teachingService.group(id) });

  return (
    <div>
      <Link to="/teaching" className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-sm text-body text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> O‘qituvchi markazi
      </Link>
      {query.isPending ? (
        <TableSkeleton rows={6} columns={7} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <PageHeader
            title={query.data.group.name}
            description={`${query.data.group.course.name} · ${query.data.group.students} o‘quvchi`}
            actions={
              <div className="flex flex-wrap gap-2">
                {canUseAi && (
                  <Button variant="secondary" leftIcon={<Bot className="size-4" aria-hidden />} onClick={() => setAiOpen(true)}>
                    AI tahlil
                  </Button>
                )}
                <Button variant="secondary" leftIcon={<Target className="size-4" aria-hidden />} onClick={() => setMasteryOpen(true)}>
                  Mavzular bo‘yicha
                </Button>
              </div>
            }
          />
          <Card className="overflow-hidden">
            <GroupStudentsTable students={query.data.students} label={`${query.data.group.name} o‘quvchilari`} />
          </Card>
          {aiOpen && <GroupAiModal group={{ id: query.data.group.id, name: query.data.group.name }} onClose={() => setAiOpen(false)} />}
          {masteryOpen && <GroupMasteryModal group={{ id: query.data.group.id, name: query.data.group.name }} onClose={() => setMasteryOpen(false)} />}
        </>
      )}
    </div>
  );
}
