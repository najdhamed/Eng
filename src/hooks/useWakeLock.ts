import { useEffect } from 'react';
import { keepScreenOn } from '../services/device';

/** Keeps the phone screen awake while `active`, re-acquiring it when the tab returns. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let release: () => void = () => undefined;
    let cancelled = false;

    const acquire = () => {
      void keepScreenOn().then((fn) => {
        if (cancelled) fn();
        else release = fn;
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      release();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);
}
