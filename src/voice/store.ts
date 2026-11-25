import type { Locale } from '../domain/types';

/** A recording kept on this device: the phrase it says and the audio (a mono 16 kHz WAV). */
export interface StoredClip {
  readonly key: string;
  readonly text: string;
  readonly wav: Uint8Array;
  readonly ms: number;
}

export interface ClipStore {
  list(locale: Locale): Promise<StoredClip[]>;
  put(locale: Locale, clip: StoredClip): Promise<void>;
  remove(locale: Locale, key: string): Promise<void>;
  clear(locale: Locale): Promise<void>;
}

/** Keeps clips for this visit only. Used when the browser has no usable IndexedDB. */
export class MemoryClipStore implements ClipStore {
  private readonly clips = new Map<string, StoredClip>();
  private id = (locale: Locale, key: string) => `${locale}\u0000${key}`;

  async list(locale: Locale): Promise<StoredClip[]> {
    return [...this.clips.entries()]
      .filter(([id]) => id.startsWith(`${locale}\u0000`))
      .map(([, c]) => c);
  }
  async put(locale: Locale, clip: StoredClip): Promise<void> {
    this.clips.set(this.id(locale, clip.key), clip);
  }
  async remove(locale: Locale, key: string): Promise<void> {
    this.clips.delete(this.id(locale, key));
  }
  async clear(locale: Locale): Promise<void> {
    for (const id of [...this.clips.keys()])
      if (id.startsWith(`${locale}\u0000`)) this.clips.delete(id);
  }
}

const DB_NAME = 'darbak-voice';
const STORE = 'clips';

interface Row {
  readonly locale: Locale;
  readonly key: string;
  readonly text: string;
  readonly wav: ArrayBuffer;
  readonly ms: number;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** IndexedDB, with one row per recording. Audio is stored as bytes, which every browser accepts. */
export class IdbClipStore implements ClipStore {
  private opened: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.opened ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(STORE, { keyPath: ['locale', 'key'] });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.opened;
  }

  async list(locale: Locale): Promise<StoredClip[]> {
    const db = await this.db();
    const rows = await request<Row[]>(db.transaction(STORE).objectStore(STORE).getAll());
    return rows
      .filter((row) => row.locale === locale)
      .map((row) => ({ key: row.key, text: row.text, wav: new Uint8Array(row.wav), ms: row.ms }));
  }

  async put(locale: Locale, clip: StoredClip): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    const row: Row = {
      locale,
      key: clip.key,
      text: clip.text,
      wav: clip.wav.buffer.slice(
        clip.wav.byteOffset,
        clip.wav.byteOffset + clip.wav.byteLength,
      ) as ArrayBuffer,
      ms: clip.ms,
    };
    tx.objectStore(STORE).put(row);
    await done(tx);
  }

  async remove(locale: Locale, key: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete([locale, key]);
    await done(tx);
  }

  async clear(locale: Locale): Promise<void> {
    const clips = await this.list(locale);
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    for (const clip of clips) tx.objectStore(STORE).delete([locale, clip.key]);
    await done(tx);
  }
}

/** IndexedDB when it works, memory when it does not (private windows, blocked storage). */
export function createClipStore(): ClipStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbClipStore();
  } catch {
    // Fall through to memory.
  }
  return new MemoryClipStore();
}
