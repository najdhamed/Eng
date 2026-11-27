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

/** Puts text on the clipboard. Resolves to false when the browser refuses (then offer a download instead). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Hands the browser a text file to save. A byte-order mark makes Excel read Arabic as UTF-8. */
export function saveTextFile(filename: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(
    new Blob([BYTE_ORDER_MARK, text], { type: `${type};charset=utf-8` }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
