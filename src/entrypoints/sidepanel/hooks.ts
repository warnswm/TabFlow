import { useEffect, useState } from 'react';
import {
  type BrowserTab,
  grantedSitePatterns,
  onSiteAccessChanged,
  watchActiveTab,
} from '@/lib/browser-api';

/** The active tab of the panel's window, kept up to date. */
export function useActiveTab(): BrowserTab | undefined {
  const [tab, setTab] = useState<BrowserTab>();
  useEffect(() => watchActiveTab(setTab), []);
  return tab;
}

/** Sites TabFlow may read videos on (match patterns); updated when access changes. */
export function useGrantedSites(): string[] {
  const [granted, setGranted] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void grantedSitePatterns().then((patterns) => {
        if (alive) setGranted(patterns);
      });
    read();
    onSiteAccessChanged(read);
    return () => {
      alive = false;
    };
  }, []);
  return granted;
}
