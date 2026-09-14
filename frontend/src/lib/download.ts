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
  // UTF-8 nom (filename*) ustun — lotin bo‘lmagan harflar saqlanadi
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const match = /filename="?([^";]+)"?/.exec(disposition);
  let fileName = match?.[1] ?? fallbackName;
  if (encoded) {
    try {
      fileName = decodeURIComponent(encoded);
    } catch {
      // noto‘g‘ri kodlangan — ASCII nom qoladi
    }
  }

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
