import { useEffect, useState } from 'react';

/** Qiymat o‘zgarishini `delay` ms kutib qaytaradi — qidiruvda har bosishda so‘rov ketmasligi uchun. */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
