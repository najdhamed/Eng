import { useCallback, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { speaker } from '../services/speech';
import { usePrefs } from '../state/PrefsContext';

/** Speaks in the visitor's language and speed, and only when voice guidance is on. */
export function useSpeech() {
  const { prefs } = usePrefs();
  const { locale } = useI18n();
  const snapshot = useSyncExternalStore(
    speaker.subscribe,
    speaker.getSnapshot,
    speaker.getSnapshot,
  );

  const speak = useCallback(
    (text: string, options: { force?: boolean } = {}) => {
      if (!prefs.voice && !options.force) return;
      speaker.speak(text, locale, prefs.rate);
    },
    [prefs.voice, prefs.rate, locale],
  );

  const cancel = useCallback(() => speaker.cancel(), []);

  return {
    speak,
    cancel,
    supported: snapshot.supported,
    speaking: snapshot.speaking,
    voiceName: snapshot.voices > 0 ? speaker.voiceFor(locale)?.name : undefined,
    fallbackVoice: snapshot.voices > 0 && speaker.isFallbackVoice(locale),
  };
}
