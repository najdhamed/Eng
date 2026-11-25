import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { PlannedRoute } from '../navigation/planner';
import { LiveTracker, type LiveSnapshot } from '../services/live';

const noSubscribe = () => () => undefined;
const noSnapshot = (): LiveSnapshot | null => null;

/**
 * Live guidance for one route. There is one tracker per route; it starts only
 * when the person taps (browsers will not ask for permission otherwise) and is
 * stopped when they leave the page, so no sensor keeps running unseen.
 */
export function useLiveTracking(route: PlannedRoute | null) {
  const tracker = useMemo(() => (route ? new LiveTracker(route) : null), [route]);
  useEffect(() => () => tracker?.stop(), [tracker]);
  const live = useSyncExternalStore(
    tracker?.subscribe ?? noSubscribe,
    tracker?.getSnapshot ?? noSnapshot,
    noSnapshot,
  );
  return { tracker, live };
}
