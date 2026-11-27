import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { speaker } from '../services/speech';
import { voiceEngine, sayer } from '../voice/voice';
import { usePrefs } from '../state/PrefsContext';

/**
 * Speaks in the visitor's language and speed, and only when voice guidance is
 * on. The Saudi studio voice that ships with the site is used for any sentence
 * it can say in full; everything else uses the device's own voice.
 */
export function useSpeech() {
  const { prefs } = usePrefs();
  const { locale } = useI18n();
  const synth = useSyncExternalStore(speaker.subscribe, speaker.getSnapshot, speaker.getSnapshot);
  const pack = useSyncExternalStore(
    voiceEngine.subscribe,
    voiceEngine.getSnapshot,
    voiceEngine.getSnapshot,
  );

  useEffect(() => {
    void voiceEngine.load(locale).then(() => {
      // Keep the voice clips for offline use, unless the person asked to save data.
      const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
      if (!saveData) void voiceEngine.warm(locale);
    });
  }, [locale]);

  const speak = useCallback(
    (text: string, options: { force?: boolean } = {}) => {
      if (!prefs.voice && !options.force) return;
      sayer.say(text, locale, prefs.rate, prefs.voicePack, prefs.marks);
    },
    [prefs.voice, prefs.rate, prefs.voicePack, prefs.marks, locale],
  );

  const cancel = useCallback(() => sayer.stop(), []);

  // `pack.version` makes this recompute once the clips have loaded.
  const packClips = useMemo(() => voiceEngine.size(locale), [locale, pack.version]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    speak,
    cancel,
    supported: synth.supported || packClips > 0,
    speaking: synth.speaking || pack.speaking,
    packClips,
    voiceName: synth.voices > 0 ? speaker.voiceFor(locale)?.name : undefined,
    fallbackVoice: synth.voices > 0 && speaker.isFallbackVoice(locale),
  };
}
