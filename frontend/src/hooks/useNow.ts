import { useEffect, useState } from 'react';

/** Joriy vaqt (ms) — `intervalMs` da bir yangilanadi. "Kechikkan" kabi belgilar o‘z-o‘zidan yangilanib turadi. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
