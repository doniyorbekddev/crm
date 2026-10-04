import { useUiStore } from '@/store/ui.store';
import type { TableDensity } from '@/store/ui.store';

/** `<DataTable {...useTableDensity()} />` — zichlik tanlovi barcha jadvallarda bir xil va saqlanadi */
export function useTableDensity(): { density: TableDensity; onDensityChange: (density: TableDensity) => void } {
  const density = useUiStore((state) => state.tableDensity);
  const onDensityChange = useUiStore((state) => state.setTableDensity);
  return { density, onDensityChange };
}
