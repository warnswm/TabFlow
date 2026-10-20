import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { parseRoute, type Route, routeHash } from '@/lib/app/route';
import { builtInAiState, type BuiltInAiState } from '@/lib/browser-api';
import { getLanguage } from '@/lib/i18n';

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

/** Reloads `load` now and whenever the page gets the focus back (after a Chrome page). */
export function useOnFocus<T>(load: () => Promise<T>): [T | undefined, () => void] {
  const [value, setValue] = useState<T>();
  const reload = useCallback(() => {
    load()
      .then(setValue)
      .catch(() => undefined);
  }, [load]);
  useEffect(() => {
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  return [value, reload];
}

/** How often the state of Gemini Nano is checked again while Chrome downloads it. */
const AI_CHECK_MS = 5000;

/**
 * Whether Gemini Nano can be used here. Checked again every few seconds until it is ready or
 * known to be unavailable: Chrome downloads the model in the background, the page is not told.
 * The setter lets a click show `downloading` at once.
 */
export function useBuiltInAi(): [BuiltInAiState | undefined, (state: BuiltInAiState) => void] {
  const [state, setState] = useState<BuiltInAiState>();
  const settled = state === 'available' || state === 'unavailable';
  useEffect(() => {
    let live = true;
    const check = () => {
      builtInAiState(getLanguage())
        .then((next) => {
          if (live) setState(next);
        })
        .catch(() => undefined);
    };
    check();
    const timer = settled ? undefined : window.setInterval(check, AI_CHECK_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [settled]);
  return [state, setState];
}
