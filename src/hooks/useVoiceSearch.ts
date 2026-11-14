import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import { getRecognition, type Recognition } from '../services/recognition';

export type VoiceSearchState = 'idle' | 'listening';

/** Speech-to-text for the search box, in Saudi Arabic or English. */
export function useVoiceSearch(onText: (text: string) => void) {
  const { locale } = useI18n();
  const [state, setState] = useState<VoiceSearchState>('idle');
  const [error, setError] = useState<MessageKey | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;

  const stop = useCallback(() => {
    recognition.current?.abort();
    recognition.current = null;
    setState('idle');
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setError('voice.unsupported');
      return;
    }
    stop();
    const rec = new Ctor();
    rec.lang = locale === 'ar' ? 'ar-SA' : 'en-GB';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) callback.current(text);
      else setError('voice.noMatch');
    };
    rec.onerror = (event) => {
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'voice.denied'
          : 'voice.noMatch',
      );
      setState('idle');
    };
    rec.onend = () => setState('idle');
    recognition.current = rec;
    try {
      rec.start();
      setError(null);
      setState('listening');
    } catch {
      setError('voice.denied');
      setState('idle');
    }
  }, [locale, stop]);

  useEffect(() => () => recognition.current?.abort(), []);

  return {
    supported: getRecognition() !== null,
    state,
    error,
    start,
    stop,
    clearError: () => setError(null),
  };
}
