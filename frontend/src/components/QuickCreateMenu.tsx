import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useAuthStore } from '@/store/auth.store';
import { availableQuickActions } from './quickActions';

/** Topbar'dagi "Yaratish" — ruxsat etilgan yaratish amallari; hech biri bo'lmasa ko'rinmaydi */
export function QuickCreateMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actions = availableQuickActions(user);
  if (actions.length === 0) return null;

  return (
    <ActionMenu
      label="Tez yaratish"
      trigger={{ label: 'Yaratish', icon: Plus }}
      triggerVariant="primary"
      items={actions.map((action) => ({
        label: action.label,
        icon: action.icon,
        onSelect: () => void navigate(action.url),
      }))}
    />
  );
}
