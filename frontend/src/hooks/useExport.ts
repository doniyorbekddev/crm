import { useState } from 'react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { ExportFormat } from '@/lib/download';

/** Ro‘yxat/hisobotni CSV yoki Excel ga yuklab olish — holat va xabarlar bilan */
export function useExport() {
  const [exporting, setExporting] = useState(false);

  const run = async (path: string, params: object, baseName: string, format: ExportFormat) => {
    setExporting(true);
    try {
      await downloadFile(path, { ...params, format }, `${baseName}.${format}`);
      toast.success(format === 'xlsx' ? 'Excel fayl yuklab olindi' : 'CSV fayl yuklab olindi');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return { exporting, run };
}
