/** A short buzz when a step changes, so people feel the app moved on. */
export function buzz(ms = 25): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported.
  }
}

/** True when the app runs inside another page (an iframe preview, an embed). */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keeps the screen on while someone follows a route. Resolves to a release function. */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const wakeLock = (
      navigator as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }
    ).wakeLock;
    const sentinel = await wakeLock?.request('screen');
    return () => void sentinel?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}
