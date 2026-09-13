import axios from 'axios';
import { api } from '@/lib/api';

export type ExportFormat = 'csv' | 'xlsx';

/** Blob javobdagi API xatosini JSON ga qaytaradi — getErrorMessage server matnini ko‘rsata olishi uchun */
async function unwrapBlobError(error: unknown): Promise<never> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text()) as unknown;
    } catch {
      // Javob JSON emas — umumiy xabar ko‘rsatiladi
    }
  }
  throw error;
}

/** Serverdan faylni yuklab, brauzerda saqlashni boshlaydi (nom Content-Disposition dan olinadi) */
export async function downloadFile(path: string, params: object, fallbackName: string): Promise<void> {
  const response = await api.get<Blob>(path, { params, responseType: 'blob' }).catch(unwrapBlobError);
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename="?([^";]+)"?/.exec(disposition);

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
