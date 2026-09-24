import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { usePreference } from '@/hooks/usePreference';
import type { PortalMe } from '@/types/portal';

/**
 * Kabinet konteksti: kim kirgan va (ota-ona bo‘lsa) qaysi farzand tanlangan.
 *
 * Tanlov `portal.activeChild` sozlamasida saqlanadi — ota-ona telefonda tanlagan farzand
 * kompyuterda ham ochiladi. Sahifalar `studentId` ni faqat shu yerdan oladi; backend baribir
 * egalikni har so‘rovda qayta tekshiradi.
 */
export interface PortalContextValue {
  me: PortalMe;
  /** Tanlangan (yoki yagona) o‘quvchi */
  activeChild: string;
  setActiveChild: (studentId: string) => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

function parseChildId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function PortalProvider({ me, children }: { me: PortalMe; children: ReactNode }) {
  const preference = usePreference<string>('portal.activeChild', parseChildId);

  // Saqlangan tanlov endi ro‘yxatda bo‘lmasa (farzand chiqarilgan) — birinchisiga qaytiladi
  const saved = preference.value;
  const fallback = me.children[0]?.studentId ?? '';
  const activeChild = saved && me.children.some((child) => child.studentId === saved) ? saved : fallback;

  const value: PortalContextValue = {
    me,
    activeChild,
    setActiveChild: (studentId) => {
      if (studentId !== activeChild) preference.save(studentId);
    },
  };

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error('usePortal faqat PortalLayout ichida ishlaydi');
  return value;
}
