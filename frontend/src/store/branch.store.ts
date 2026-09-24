import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Tanlangan filial — ro'yxat so'rovlariga `branchId` sifatida qo'shiladi.
 *
 * `null` — "barcha filiallar" (faqat `branch.view_all` ruxsati borlar uchun ma'noli;
 * qolganlar uchun backend baribir o'z filiali bilan cheklaydi).
 */
interface BranchState {
  branchId: string | null;
  setBranchId: (branchId: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      branchId: null,
      setBranchId: (branchId) => set({ branchId }),
    }),
    { name: 'crm-branch' },
  ),
);

/** Ro'yxat parametrlariga qo'shiladigan filial bo'lagi */
export function useBranchParam(): { branchId?: string } {
  const branchId = useBranchStore((state) => state.branchId);
  return branchId ? { branchId } : {};
}
