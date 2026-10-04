import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LeadsView = 'table' | 'kanban';
export type TableDensity = 'comfortable' | 'compact';

interface UiState {
  /** Desktop’da sidebar faqat ikonkalar ko‘rinishida */
  sidebarCollapsed: boolean;
  /** Mobil/planshetda sidebar drawer ochiq */
  mobileSidebarOpen: boolean;
  /** Sidebar'da foydalanuvchi yig'ib qo'ygan bo'limlar (`NavSection.id`) */
  collapsedNavSections: string[];
  /** Jadval qatorlari zichligi — barcha jadvallar uchun bitta tanlov (shu brauzerda) */
  tableDensity: TableDensity;
  /** Leadlar sahifasining oxirgi tanlangan ko‘rinishi */
  leadsView: LeadsView;
  toggleSidebarCollapsed: () => void;
  toggleNavSection: (id: string) => void;
  setTableDensity: (density: TableDensity) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setLeadsView: (view: LeadsView) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      collapsedNavSections: [],
      tableDensity: 'comfortable',
      leadsView: 'table',
      setTableDensity: (density) => set({ tableDensity: density }),
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleNavSection: (id) =>
        set((state) => ({
          collapsedNavSections: state.collapsedNavSections.includes(id)
            ? state.collapsedNavSections.filter((item) => item !== id)
            : [...state.collapsedNavSections, id],
        })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setLeadsView: (view) => set({ leadsView: view }),
    }),
    {
      name: 'crm-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, collapsedNavSections: state.collapsedNavSections, tableDensity: state.tableDensity, leadsView: state.leadsView }),
    },
  ),
);
