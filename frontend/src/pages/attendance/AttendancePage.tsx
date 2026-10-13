import { BarChart3, LayoutDashboard, NotebookPen, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { AttendanceDayBoard } from './AttendanceDayBoard';
import { AttendanceRanking } from './AttendanceRanking';
import { AttendanceStats } from './AttendanceStats';
import { TeacherOverview } from './TeacherOverview';

type Tab = 'journal' | 'overview' | 'stats' | 'ranking';

const TABS: ReadonlyArray<{ value: Tab; label: string; icon: LucideIcon }> = [
  { value: 'journal', label: 'Darslar', icon: NotebookPen },
  { value: 'overview', label: 'Mening darslarim', icon: LayoutDashboard },
  { value: 'stats', label: 'Statistika', icon: BarChart3 },
  { value: 'ranking', label: 'Reyting', icon: Trophy },
];

/**
 * Davomat bo'limi. Birinchi oyna — kunlik taxta: shu kunga darsi bor guruhlar kartalari; kartani bosish
 * guruh davomati sahifasini (`/attendance/groups/:id`) ochadi.
 */
export default function AttendancePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('journal');

  // Eski havolalar (`/attendance?groupId=…`) — yangi guruh sahifasiga
  const legacyGroupId = searchParams.get('groupId');
  if (legacyGroupId) {
    const date = searchParams.get('date');
    return <Navigate to={`/attendance/groups/${legacyGroupId}${date ? `?date=${date}` : ''}`} replace />;
  }

  return (
    <>
      <PageHeader title="Davomat" description="Bugungi darslar, statistika va o‘quvchilar reytingi" />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} panels={false}>
        <TabList label="Davomat bo‘limlari" className="mb-4">
          {TABS.map((item) => (
            <Tab key={item.value} value={item.value} icon={<item.icon className="size-4" aria-hidden />}>
              {item.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>

      {tab === 'journal' && <AttendanceDayBoard />}
      {tab === 'stats' && <AttendanceStats />}
      {tab === 'ranking' && <AttendanceRanking />}
      {tab === 'overview' && <TeacherOverview onSelectGroup={(groupId) => void navigate(`/attendance/groups/${groupId}`)} />}
    </>
  );
}
