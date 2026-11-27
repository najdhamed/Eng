import type { Locale } from '../domain/types';

/** What speaking needs from the recorded pack and from the device's own voice. */
export interface Recorded {
  canSpeak(text: string, locale: Locale): boolean;
  speak(text: string, locale: Locale, rate: 'slow' | 'normal' | 'fast'): Promise<boolean>;
  cancel(): void;
  /**
   * Optional: whether the pack for this language has finished loading, and a
   * promise that settles when it has (or soon after, if it is slow). A
   * sentence spoken the moment a page opens would otherwise miss the pack.
   */
  loaded?(locale: Locale): boolean;
  ready?(locale: Locale): Promise<void>;
}

export interface Synthetic {
  speak(text: string, locale: Locale, rate: 'slow' | 'normal' | 'fast'): void;
  cancel(): void;
}

/**
 * Chooses the voice for each sentence: the recorded one when it can say every
 * word, the device's own otherwise (also if playing a recording fails). A
 * newer sentence always replaces an older one, including a fallback that was
 * still waiting to start.
 */
export function createSayer(
  recorded: Recorded,
  synthetic: Synthetic,
  /** Turns a sentence into what the device voice should read (vowel marks, numbers as words). */
  prepare: (text: string, locale: Locale) => string = (text) => text,
) {
  let ticket = 0;

  return {
    say(
      text: string,
      locale: Locale,
      rate: 'slow' | 'normal' | 'fast',
      useRecorded = true,
      marks = true,
    ): void {
      const mine = ++ticket;
      synthetic.cancel();
      // The recorded clips are found by the plain text; only the device voice needs the marks.
      const deviceText = marks ? prepare(text, locale) : text;

      const speakNow = () => {
        if (useRecorded && recorded.canSpeak(text, locale)) {
          void recorded.speak(text, locale, rate).then((played) => {
            if (!played && mine === ticket) synthetic.speak(deviceText, locale, rate);
          });
          return;
        }
        recorded.cancel();
        synthetic.speak(deviceText, locale, rate);
      };

      if (useRecorded && recorded.ready && recorded.loaded && !recorded.loaded(locale)) {
        // The pack is still arriving: wait for it rather than fall back by mistake.
        void recorded.ready(locale).then(() => {
          if (mine === ticket) speakNow();
        });
        return;
      }
      speakNow();
    },

    stop(): void {
      ticket += 1;
      recorded.cancel();
      synthetic.cancel();
    },
  };
}
