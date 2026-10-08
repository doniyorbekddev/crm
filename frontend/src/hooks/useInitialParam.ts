import { useSearchParams } from 'react-router-dom';

/**
 * Sahifa ochilgandagi URL parametridan boshlang'ich filtr qiymati (masalan rahbar panelidagi chip
 * `/alerts?severity=CRITICAL` ga olib kelganda).
 *
 * Faqat ruxsat etilgan qiymat qabul qilinadi — URL'dagi boshqa narsa jimgina standartga tushadi.
 * Qiymat bir marta, `useState` ning boshlang'ich qiymati sifatida ishlatiladi; keyin filtr odatdagidek
 * sahifa holatida yashaydi.
 */
export function useInitialParam<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const [params] = useSearchParams();
  const value = params.get(name);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
