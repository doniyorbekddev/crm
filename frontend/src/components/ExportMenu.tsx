import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import type { ExportFormat } from '@/lib/download';

interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
  loading?: boolean;
  disabled?: boolean;
}

/** "Eksport" tugmasi: Excel (.xlsx) yoki CSV */
export function ExportMenu({ onExport, loading = false, disabled = false }: ExportMenuProps) {
  return (
    <ActionMenu
      trigger={{ label: loading ? 'Tayyorlanmoqda…' : 'Eksport', icon: Download }}
      disabled={loading || disabled}
      items={[
        { label: 'Excel (.xlsx)', icon: FileSpreadsheet, onSelect: () => onExport('xlsx') },
        { label: 'CSV', icon: FileText, onSelect: () => onExport('csv') },
      ]}
    />
  );
}
