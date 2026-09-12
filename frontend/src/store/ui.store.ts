import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LeadsView = 'table' | 'kanban';

interface UiState {
  /** Desktop’da sidebar faqat ikonkalar ko‘rinishida */
  sidebarCollapsed: boolean;
  /** Mobil/planshetda sidebar drawer ochiq */
  mobileSidebarOpen: boolean;
  /** Leadlar sahifasining oxirgi tanlangan ko‘rinishi */
  leadsView: LeadsView;
  toggleSidebarCollapsed: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setLeadsView: (view: LeadsView) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      leadsView: 'table',
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setLeadsView: (view) => set({ leadsView: view }),
    }),
    {
      name: 'crm-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, leadsView: state.leadsView }),
    },
  ),
);
