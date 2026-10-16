import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Subscribes a component to a Dexie query: it re-renders whenever the data changes,
 * including changes written by the background. Pass a stable function (module level or memoized).
 * Returns `undefined` until the first result.
 */
export function useLiveQuery<T>(query: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (result) => setValue(() => result),
      error: (error: unknown) => console.error('[TabFlow] live query failed:', error),
    });
    return () => subscription.unsubscribe();
  }, [query]);

  return value;
}
