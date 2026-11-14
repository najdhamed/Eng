const PREFIX = 'darbak:';

/**
 * localStorage can be missing or throw (private windows, blocked site data,
 * embedded previews). Every access goes through here so the app still runs,
 * just without remembering anything.
 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: settings last for this visit only.
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to remove.
  }
}
