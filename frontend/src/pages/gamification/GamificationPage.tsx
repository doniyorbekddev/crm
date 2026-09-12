import { Settings2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GamificationSettings } from './GamificationSettings';
import { LeaderboardTab } from './LeaderboardTab';
import { StudentXpModal } from './StudentXpModal';

type Tab = 'leaderboard' | 'settings';

export default function GamificationPage() {
  const canManage = usePermission(PERMISSIONS.GAMIFICATION_MANAGE);
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const tabs: ReadonlyArray<{ value: Tab; label: string; icon: typeof Trophy }> = [
    { value: 'leaderboard', label: 'Reyting', icon: Trophy },
    ...(canManage ? ([{ value: 'settings', label: 'Qoidalar va nishonlar', icon: Settings2 }] as const) : []),
  ];

  return (
    <>
      <PageHeader
        title="Gamification"
        description="XP, darajalar, nishonlar va o‘quvchilar reytingi"
        documentTitle="Reyting"
      />

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Gamification bo‘limlari" className="mb-4 -mx-1 flex gap-1 overflow-x-auto px-1">
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
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'leaderboard' ? (
        <LeaderboardTab onSelectStudent={setSelectedStudentId} />
      ) : (
        <GamificationSettings />
      )}

      {selectedStudentId && <StudentXpModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />}
    </>
  );
}
