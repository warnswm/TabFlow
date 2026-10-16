import { useEffect, useState, useSyncExternalStore } from 'react';
import { parseRoute, type Route, routeHash } from '@/lib/app/route';

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The current screen from the URL hash. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash);
  return parseRoute(hash);
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}

/** Current time, refreshed every minute — for «5 мин назад». */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
