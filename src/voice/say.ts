import type { Locale } from '../domain/types';

/** What speaking needs from the recorded pack and from the device's own voice. */
export interface Recorded {
  canSpeak(text: string, locale: Locale): boolean;
  speak(text: string, locale: Locale, rate: 'slow' | 'normal' | 'fast'): Promise<boolean>;
  cancel(): void;
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
export function createSayer(recorded: Recorded, synthetic: Synthetic) {
  let ticket = 0;

  return {
    say(text: string, locale: Locale, rate: 'slow' | 'normal' | 'fast', useRecorded = true): void {
      const mine = ++ticket;
      synthetic.cancel();
      if (useRecorded && recorded.canSpeak(text, locale)) {
        void recorded.speak(text, locale, rate).then((played) => {
          if (!played && mine === ticket) synthetic.speak(text, locale, rate);
        });
        return;
      }
      recorded.cancel();
      synthetic.speak(text, locale, rate);
    },

    stop(): void {
      ticket += 1;
      recorded.cancel();
      synthetic.cancel();
    },
  };
}
