import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePrefs } from '../state/PrefsContext';
import { createTranslator, type Translator } from './translate';

const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const translator = useMemo(() => createTranslator(prefs.locale), [prefs.locale]);
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>;
}

export function useI18n(): Translator {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
