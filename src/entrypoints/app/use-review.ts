import { useMemo } from 'react';
import type { Overview } from '@/lib/app/overview';
import { type ReviewItem, reviewItems } from '@/lib/app/review';
import { repositories } from '@/lib/db';
import { useLiveQuery } from '@/lib/use-live-query';
import { useNow } from './hooks';
import { useUi } from './store';

const loadQueue = () => repositories.queue.list('queued');

/** What «Давно не открывали» shows now, the oldest first; the sidebar shows the count. */
export function useReview(overview: Overview): ReviewItem[] {
  const queue = useLiveQuery(loadQueue);
  const days = useUi((state) => state.reviewDays);
  const now = useNow();
  return useMemo(
    () => (queue ? reviewItems(overview, queue, now, days) : []),
    [overview, queue, now, days],
  );
}
