import type { Locale } from '../domain/types';

export type SpeechRate = 'slow' | 'normal' | 'fast';

const RATE: Record<SpeechRate, number> = { slow: 0.8, normal: 1, fast: 1.2 };
const PREFERRED_LANG: Record<Locale, readonly string[]> = {
  // Saudi Arabic first, then any Gulf voice, then any Arabic voice.
  ar: ['ar-sa', 'ar-ae', 'ar-kw', 'ar-qa', 'ar-bh', 'ar-om', 'ar'],
  en: ['en-gb', 'en-us', 'en'],
};

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

  voiceFor(locale: Locale): SpeechSynthesisVoice | undefined {
    const lang = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replace('_', '-');
    for (const preferred of PREFERRED_LANG[locale]) {
      const match = this.voices.find(
        (voice) => lang(voice) === preferred || lang(voice).startsWith(`${preferred}-`),
      );
      if (match) return match;
    }
    return undefined;
  }

  /** True when the chosen voice is not the one we wanted (e.g. no Saudi voice installed). */
  isFallbackVoice(locale: Locale): boolean {
    const voice = this.voiceFor(locale);
    return (
      !voice || !voice.lang.toLowerCase().replace('_', '-').startsWith(PREFERRED_LANG[locale][0]!)
    );
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
