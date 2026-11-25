import type { Locale } from '../domain/types';
import { atomId, normalizeSpeech, segment } from './text';
import { MemoryClipStore, createClipStore, type ClipStore, type StoredClip } from './store';
import { readZip, writeZip } from './zip';

/**
 * The recorded voice pack: clips recorded on this device (the Voice Studio) plus
 * the pack shipped with the site (public/voice/<locale>/). A sentence is spoken
 * from clips only when every word of it is covered; otherwise the caller falls
 * back to the device's own voice.
 */

export interface ShippedManifest {
  readonly version: 1;
  readonly locale: Locale;
  readonly clips: readonly { key: string; text: string; file: string; ms: number }[];
}

export interface Playback {
  stop(): void;
}

export interface AudioPort {
  decode(bytes: Uint8Array): Promise<unknown>;
  play(buffers: readonly unknown[], rate: number, onEnd: () => void): Promise<Playback>;
}

export interface EngineDeps {
  readonly store: ClipStore;
  readonly audio: AudioPort;
  fetchBytes(url: string): Promise<Uint8Array>;
  fetchJson(url: string): Promise<unknown>;
  /** Where a locale's shipped pack lives. */
  packUrl(locale: Locale, file: string): string;
}

export type PackRate = 'slow' | 'normal' | 'fast';
const PLAYBACK_RATE: Record<PackRate, number> = { slow: 0.9, normal: 1, fast: 1.12 };

interface Entry {
  readonly key: string;
  readonly text: string;
  readonly ms: number;
  readonly origin: 'device' | 'shipped';
  readonly wav?: Uint8Array;
  readonly file?: string;
  decoded?: Promise<unknown>;
}

export interface EngineSnapshot {
  /** Changes whenever clips are added, removed or loaded. */
  readonly version: number;
  readonly speaking: boolean;
}

export class VoiceEngine {
  private readonly packs = new Map<Locale, Map<string, Entry>>();
  private readonly keyCache = new Map<Locale, Set<string>>();
  private readonly loading = new Map<Locale, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private snapshot: EngineSnapshot = { version: 0, speaking: false };
  private playing: Playback | null = null;
  private ticket = 0;

  constructor(private readonly deps: EngineDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  private update(patch: Partial<EngineSnapshot>, changed = false): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      version: changed ? this.snapshot.version + 1 : this.snapshot.version,
    };
    this.listeners.forEach((listener) => listener());
  }

  private pack(locale: Locale): Map<string, Entry> {
    let pack = this.packs.get(locale);
    if (!pack) {
      pack = new Map();
      this.packs.set(locale, pack);
    }
    return pack;
  }

  /** Loads the shipped pack and this device's recordings. Safe to call again. */
  load(locale: Locale): Promise<void> {
    let pending = this.loading.get(locale);
    if (!pending) {
      pending = this.loadNow(locale);
      this.loading.set(locale, pending);
    }
    return pending;
  }

  private async loadNow(locale: Locale): Promise<void> {
    const pack = this.pack(locale);
    try {
      const raw = (await this.deps.fetchJson(
        this.deps.packUrl(locale, 'manifest.json'),
      )) as ShippedManifest;
      if (raw && raw.version === 1 && Array.isArray(raw.clips)) {
        for (const clip of raw.clips) {
          if (!clip.key || !clip.file) continue;
          pack.set(clip.key, {
            key: clip.key,
            text: clip.text,
            ms: clip.ms,
            origin: 'shipped',
            file: clip.file,
          });
        }
      }
    } catch {
      // No shipped pack: that is normal until one is recorded.
    }
    try {
      for (const clip of await this.deps.store.list(locale)) {
        pack.set(clip.key, {
          key: clip.key,
          text: clip.text,
          ms: clip.ms,
          origin: 'device',
          wav: clip.wav,
        });
      }
    } catch {
      // Storage unavailable: only the shipped pack.
    }
    this.keyCache.delete(locale);
    this.update({}, true);
  }

  has(locale: Locale, key: string): boolean {
    return this.packs.get(locale)?.has(key) ?? false;
  }

  entries(locale: Locale): ReadonlyMap<string, Entry> {
    return this.pack(locale);
  }

  keys(locale: Locale): ReadonlySet<string> {
    let keys = this.keyCache.get(locale);
    if (!keys) {
      keys = new Set(this.pack(locale).keys());
      this.keyCache.set(locale, keys);
    }
    return keys;
  }

  size(locale: Locale): number {
    return this.pack(locale).size;
  }

  /** True when recordings alone can say this sentence. */
  canSpeak(text: string, locale: Locale): boolean {
    if (this.size(locale) === 0) return false;
    const cover = segment(text, this.keys(locale));
    return cover !== null && cover.length > 0;
  }

  private decode(entry: Entry, locale: Locale): Promise<unknown> {
    entry.decoded ??= (async () => {
      const bytes =
        entry.wav ??
        (await this.deps.fetchBytes(
          this.deps.packUrl(locale, entry.file ?? `${atomId(entry.key)}.wav`),
        ));
      return this.deps.audio.decode(bytes);
    })();
    // A failed decode is not cached, so a later attempt can try again.
    entry.decoded.catch(() => {
      entry.decoded = undefined;
    });
    return entry.decoded;
  }

  /** Speaks the sentence from recordings. Resolves false if it could not (the caller should fall back). */
  async speak(text: string, locale: Locale, rate: PackRate = 'normal'): Promise<boolean> {
    const mine = ++this.ticket;
    this.stopPlayback();
    const cover = segment(text, this.keys(locale));
    if (!cover || cover.length === 0) return false;
    const pack = this.pack(locale);

    try {
      this.update({ speaking: true });
      const buffers = await Promise.all(cover.map((key) => this.decode(pack.get(key)!, locale)));
      if (mine !== this.ticket) return true; // A newer sentence took over; say nothing more.
      const playback = await this.deps.audio.play(buffers, PLAYBACK_RATE[rate], () => {
        if (this.ticket === mine) {
          this.playing = null;
          this.update({ speaking: false });
        }
      });
      if (mine !== this.ticket) {
        playback.stop();
        return true;
      }
      this.playing = playback;
      return true;
    } catch {
      if (mine === this.ticket) this.update({ speaking: false });
      return false;
    }
  }

  private stopPlayback(): void {
    this.playing?.stop();
    this.playing = null;
  }

  cancel(): void {
    this.ticket += 1;
    this.stopPlayback();
    if (this.snapshot.speaking) this.update({ speaking: false });
  }

  // --- Recording and sharing ---------------------------------------------

  async save(locale: Locale, clip: StoredClip): Promise<void> {
    await this.deps.store.put(locale, clip);
    this.pack(locale).set(clip.key, {
      key: clip.key,
      text: clip.text,
      ms: clip.ms,
      origin: 'device',
      wav: clip.wav,
    });
    this.keyCache.delete(locale);
    this.update({}, true);
  }

  async remove(locale: Locale, key: string): Promise<void> {
    await this.deps.store.remove(locale, key);
    this.pack(locale).delete(key);
    this.keyCache.delete(locale);
    this.update({}, true);
  }

  /** Forgets this device's recordings (the shipped pack stays). */
  async clearDevice(locale: Locale): Promise<void> {
    await this.deps.store.clear(locale);
    const pack = this.pack(locale);
    for (const [key, entry] of pack) if (entry.origin === 'device') pack.delete(key);
    this.loading.delete(locale);
    this.keyCache.delete(locale);
    await this.load(locale);
  }

  /** The audio of one clip, to play it back in the Studio. */
  async preview(locale: Locale, key: string): Promise<void> {
    const entry = this.pack(locale).get(key);
    if (!entry) return;
    this.cancel();
    const mine = this.ticket;
    const buffer = await this.decode(entry, locale);
    if (mine !== this.ticket) return;
    this.update({ speaking: true });
    this.playing = await this.deps.audio.play([buffer], 1, () => {
      if (this.ticket === mine) {
        this.playing = null;
        this.update({ speaking: false });
      }
    });
  }

  /** A zip with manifest.json and one WAV per clip: drop it into public/voice/<locale>/. */
  async exportZip(locale: Locale): Promise<Uint8Array> {
    const files: { name: string; data: Uint8Array }[] = [];
    const clips: ShippedManifest['clips'][number][] = [];
    for (const entry of this.pack(locale).values()) {
      const file = `${atomId(entry.key)}.wav`;
      const data =
        entry.wav ?? (await this.deps.fetchBytes(this.deps.packUrl(locale, entry.file ?? file)));
      files.push({ name: file, data });
      clips.push({ key: entry.key, text: entry.text, file, ms: entry.ms });
    }
    const manifest: ShippedManifest = { version: 1, locale, clips };
    files.unshift({
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)),
    });
    return writeZip(files);
  }

  /** Adds the recordings in a zip made by exportZip. Returns how many clips it brought. */
  async importZip(locale: Locale, bytes: Uint8Array): Promise<number> {
    const files = await readZip(bytes);
    const byName = new Map(files.map((file) => [file.name.replace(/^.*\//, ''), file.data]));
    const manifestBytes = byName.get('manifest.json');
    if (!manifestBytes) throw new Error('This zip has no manifest.json');
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as ShippedManifest;
    if (manifest.version !== 1 || !Array.isArray(manifest.clips))
      throw new Error('Unknown voice pack format');
    if (manifest.locale && manifest.locale !== locale) {
      throw new Error(`This pack is for ${manifest.locale}, not ${locale}`);
    }
    let added = 0;
    for (const clip of manifest.clips) {
      const wav = byName.get(clip.file.replace(/^.*\//, ''));
      if (!wav || normalizeSpeech(clip.text) !== clip.key) continue;
      await this.save(locale, { key: clip.key, text: clip.text, wav, ms: clip.ms });
      added += 1;
    }
    return added;
  }
}

// --- Browser wiring --------------------------------------------------------

class WebAudioPort implements AudioPort {
  private context: AudioContext | null = null;

  private ctx(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  /** Browsers only let sound start after a tap: the first tap anywhere unlocks it. */
  unlock(): void {
    try {
      const ctx = this.ctx();
      void ctx.resume();
      const silent = ctx.createBuffer(1, 1, 22_050);
      const source = ctx.createBufferSource();
      source.buffer = silent;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Audio not available.
    }
  }

  decode(bytes: Uint8Array): Promise<AudioBuffer> {
    return this.ctx().decodeAudioData(bytes.slice().buffer);
  }

  async play(buffers: readonly unknown[], rate: number, onEnd: () => void): Promise<Playback> {
    const ctx = this.ctx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    const sources: AudioBufferSourceNode[] = [];
    let at = ctx.currentTime + 0.03;
    for (const buffer of buffers as AudioBuffer[]) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(ctx.destination);
      source.start(at);
      at += buffer.duration / rate;
      sources.push(source);
    }
    sources.at(-1)?.addEventListener('ended', onEnd);
    return {
      stop: () => {
        for (const source of sources) {
          try {
            source.stop();
          } catch {
            // Already finished.
          }
        }
      },
    };
  }
}

export function createVoiceEngine(): VoiceEngine {
  const audio = new WebAudioPort();
  if (typeof window !== 'undefined') {
    const unlock = () => {
      audio.unlock();
      for (const type of ['pointerdown', 'keydown', 'touchend'])
        window.removeEventListener(type, unlock);
    };
    for (const type of ['pointerdown', 'keydown', 'touchend']) {
      window.addEventListener(type, unlock, { passive: true });
    }
  }
  return new VoiceEngine({
    store: typeof window === 'undefined' ? new MemoryClipStore() : createClipStore(),
    audio,
    fetchBytes: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    fetchJson: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.json();
    },
    packUrl: (locale, file) => new URL(`voice/${locale}/${file}`, document.baseURI).toString(),
  });
}
