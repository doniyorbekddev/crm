import { useLocation } from 'react-router-dom';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { findNavEntry } from './navigation';

/**
 * Yuqori paneldagi yo'l: "Bo'lim › Sahifa". Menyu tuzilmasidan olinadi — har sahifa alohida yozmaydi.
 * Ichki sahifada (masalan o'quvchi profili) sahifa nomi ro'yxatga qaytaradigan havola bo'ladi.
 */
export function ShellBreadcrumb({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const entry = findNavEntry(pathname);
  if (!entry) return null;
  const nested = pathname !== entry.item.to;
  return (
    <Breadcrumb
      {...(className ? { className } : {})}
      items={[{ label: entry.section.title }, nested ? { label: entry.item.label, to: entry.item.to } : { label: entry.item.label }]}
    />
  );
}
