import { Settings2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { usePermission } from '@/hooks/usePermission';
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

      {/* Dizayn tizimi: yagona `Tabs` primitivi (rollar va nomlar avvalgidek) */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        {tabs.length > 1 ? (
          <>
            <TabList label="Gamification bo‘limlari" className="mb-4">
              {tabs.map(({ value, label, icon: Icon }) => (
                <Tab key={value} value={value} icon={<Icon className="size-4" aria-hidden />}>
                  {label}
                </Tab>
              ))}
            </TabList>
            <TabPanel value="leaderboard">
              <LeaderboardTab onSelectStudent={setSelectedStudentId} />
            </TabPanel>
            <TabPanel value="settings">
              <GamificationSettings />
            </TabPanel>
          </>
        ) : (
          <LeaderboardTab onSelectStudent={setSelectedStudentId} />
        )}
      </Tabs>

      {selectedStudentId && <StudentXpModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />}
    </>
  );
}
