import type { Locale } from '../domain/types';

export type SpeechRate = 'slow' | 'normal' | 'fast';

const RATE: Record<SpeechRate, number> = { slow: 0.8, normal: 1, fast: 1.2 };
const PREFERRED_LANG: Record<Locale, readonly string[]> = {
  // Saudi Arabic first, then any Gulf voice, then any Arabic voice.
  ar: ['ar-sa', 'ar-ae', 'ar-kw', 'ar-qa', 'ar-bh', 'ar-om', 'ar'],
  en: ['en-gb', 'en-us', 'en'],
};

/** The part of a SpeechSynthesisVoice that ranking needs (so it can be tested without a browser). */
export interface VoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly localService?: boolean;
  readonly default?: boolean;
}

export interface RankedVoice {
  readonly name: string;
  readonly lang: string;
  /** A Saudi-Arabic voice (ar-SA). */
  readonly saudi: boolean;
  /** Works without a connection. */
  readonly offline: boolean;
  readonly score: number;
}

const normalizeLang = (lang: string) => lang.toLowerCase().replace('_', '-');

/**
 * Orders the voices a device offers, best first, for a language: the Saudi
 * voice before other Gulf voices before any Arabic, natural-sounding ones
 * ahead of robotic ones, and voices that work offline ahead of those that
 * need a connection. Voices in other languages are left out.
 */
export function rankVoices(voices: readonly VoiceLike[], locale: Locale): RankedVoice[] {
  const wanted = PREFERRED_LANG[locale];
  const ranked: RankedVoice[] = [];
  for (const voice of voices) {
    const lang = normalizeLang(voice.lang);
    const place = wanted.findIndex((p) => lang === p || lang.startsWith(`${p}-`));
    if (place < 0) continue;
    let score = (wanted.length - place) * 20;
    if (/natural|neural|enhanced|premium|online/i.test(voice.name)) score += 8;
    if (voice.localService) score += 4;
    ranked.push({
      name: voice.name,
      lang: voice.lang,
      saudi: lang === 'ar-sa' || lang.startsWith('ar-sa-'),
      offline: voice.localService === true,
      score,
    });
  }
  return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export interface SpeechSnapshot {
  readonly supported: boolean;
  readonly speaking: boolean;
  readonly voices: number;
}

/**
 * A small wrapper around the Web Speech API's speechSynthesis that picks the
 * best voice for the locale, cancels the previous sentence before a new one,
 * and exposes a subscribable snapshot for React's useSyncExternalStore.
 */
class Speaker {
  private snapshot: SpeechSnapshot;
  private readonly listeners = new Set<() => void>();
  private voices: SpeechSynthesisVoice[] = [];
  private readonly chosen = new Map<Locale, string>();

  constructor() {
    const supported =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
    this.snapshot = { supported, speaking: false, voices: 0 };
    if (supported) {
      this.loadVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this.loadVoices());
    }
  }

  private loadVoices() {
    try {
      this.voices = window.speechSynthesis.getVoices();
    } catch {
      this.voices = [];
    }
    this.update({ voices: this.voices.length });
  }

  private update(patch: Partial<SpeechSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SpeechSnapshot => this.snapshot;

  /** The voices this device has for a language, best first. */
  list(locale: Locale): RankedVoice[] {
    return rankVoices(this.voices, locale);
  }

  /** Chooses a voice by name for a language (null goes back to the best one). */
  select(locale: Locale, name: string | null): void {
    if (name) this.chosen.set(locale, name);
    else this.chosen.delete(locale);
    this.update({});
  }

  voiceFor(locale: Locale): SpeechSynthesisVoice | undefined {
    const chosen = this.chosen.get(locale);
    const byName = chosen ? this.voices.find((voice) => voice.name === chosen) : undefined;
    if (byName) return byName;
    const best = rankVoices(this.voices, locale)[0];
    return best ? this.voices.find((voice) => voice.name === best.name) : undefined;
  }

  /** True when the chosen voice is not the one we wanted (e.g. no Saudi voice installed). */
  isFallbackVoice(locale: Locale): boolean {
    const voice = this.voiceFor(locale);
    return !voice || !normalizeLang(voice.lang).startsWith(PREFERRED_LANG[locale][0]!);
  }

  speak(text: string, locale: Locale, rate: SpeechRate = 'normal'): void {
    if (!this.snapshot.supported || !text) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale === 'ar' ? 'ar-SA' : 'en-GB';
      utterance.rate = RATE[rate];
      const voice = this.voiceFor(locale);
      if (voice) utterance.voice = voice;
      utterance.onstart = () => this.update({ speaking: true });
      utterance.onend = () => this.update({ speaking: false });
      utterance.onerror = () => this.update({ speaking: false });
      synth.speak(utterance);
    } catch {
      this.update({ speaking: false });
    }
  }

  /** Says `text` once with a particular voice, without making it the chosen one. */
  preview(name: string, text: string, rate: SpeechRate = 'normal'): void {
    const voice = this.voices.find((candidate) => candidate.name === name);
    if (!voice || !this.snapshot.supported) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice.lang;
      utterance.rate = RATE[rate];
      utterance.voice = voice;
      utterance.onstart = () => this.update({ speaking: true });
      utterance.onend = () => this.update({ speaking: false });
      utterance.onerror = () => this.update({ speaking: false });
      synth.speak(utterance);
    } catch {
      this.update({ speaking: false });
    }
  }

  cancel(): void {
    if (!this.snapshot.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore: nothing was speaking.
    }
    this.update({ speaking: false });
  }
}

export const speaker = new Speaker();
