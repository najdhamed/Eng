import type { Locale } from '../domain/types';
import { atomId, segment } from './text';

/**
 * The voice pack shipped with the site (public/voice/<locale>/): short WAV clips
 * made by scripts/generate-voice.ts. A sentence is spoken from clips only when
 * every word of it is covered; otherwise the caller falls back to the device's
 * own voice.
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
  readonly file?: string;
  decoded?: Promise<unknown>;
}

export interface EngineSnapshot {
  /** Changes whenever a pack is loaded. */
  readonly version: number;
  readonly speaking: boolean;
}

export class VoiceEngine {
  private readonly packs = new Map<Locale, Map<string, Entry>>();
  private readonly keyCache = new Map<Locale, Set<string>>();
  private readonly loading = new Map<Locale, Promise<void>>();
  private readonly loadedLocales = new Set<Locale>();
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

  /** Loads the shipped pack. Safe to call again. */
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
            file: clip.file,
          });
        }
      }
    } catch {
      // No pack shipped yet: the device voice does all the talking.
    }
    this.keyCache.delete(locale);
    this.loadedLocales.add(locale);
    this.update({}, true);
  }

  /** True once the pack for this language has been read (even if it turned out empty). */
  loaded(locale: Locale): boolean {
    return this.loadedLocales.has(locale);
  }

  /** Starts loading if needed and resolves when done, or after `waitMs` if the network is slow. */
  ready(locale: Locale, waitMs = 1500): Promise<void> {
    return Promise.race([
      this.load(locale),
      new Promise<void>((resolve) => setTimeout(resolve, waitMs)),
    ]);
  }

  private readonly warmed = new Map<Locale, Promise<number>>();

  /**
   * Downloads the shipped clips ahead of time (a few at a time) so the service
   * worker has them in its cache before the Wi-Fi drops. Nothing is decoded.
   * Resolves with how many clips were fetched; a failure just stops early.
   */
  warm(locale: Locale, concurrency = 3): Promise<number> {
    let pending = this.warmed.get(locale);
    if (!pending) {
      pending = this.warmNow(locale, concurrency);
      this.warmed.set(locale, pending);
    }
    return pending;
  }

  private async warmNow(locale: Locale, concurrency: number): Promise<number> {
    await this.load(locale);
    const queue = [...this.pack(locale).values()];
    let fetched = 0;
    let failed = false;
    const worker = async () => {
      for (let entry = queue.shift(); entry && !failed; entry = queue.shift()) {
        try {
          await this.deps.fetchBytes(
            this.deps.packUrl(locale, entry.file ?? `${atomId(entry.key)}.wav`),
          );
          fetched += 1;
        } catch {
          failed = true; // Offline or the pack changed: try again on the next visit.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return fetched;
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

  /** True when the clips alone can say this sentence. */
  canSpeak(text: string, locale: Locale): boolean {
    if (this.size(locale) === 0) return false;
    const cover = segment(text, this.keys(locale));
    return cover !== null && cover.length > 0;
  }

  private decode(entry: Entry, locale: Locale): Promise<unknown> {
    entry.decoded ??= (async () => {
      const bytes = await this.deps.fetchBytes(
        this.deps.packUrl(locale, entry.file ?? `${atomId(entry.key)}.wav`),
      );
      return this.deps.audio.decode(bytes);
    })();
    // A failed decode is not cached, so a later attempt can try again.
    entry.decoded.catch(() => {
      entry.decoded = undefined;
    });
    return entry.decoded;
  }

  /** Speaks the sentence from clips. Resolves false if it could not (the caller should fall back). */
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
