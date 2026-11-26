import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { Locale, Mobility } from '../domain/types';
import type { SpeechRate } from '../services/speech';
import { readJSON, removeKey, writeJSON } from '../services/storage';

export type TextSize = 's' | 'm' | 'l';
export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  readonly locale: Locale;
  readonly mobility: Mobility;
  readonly voice: boolean;
  readonly rate: SpeechRate;
  readonly textSize: TextSize;
  readonly theme: Theme;
  readonly highContrast: boolean;
  readonly onboarded: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  locale: 'ar',
  mobility: 'walk',
  voice: true,
  rate: 'normal',
  textSize: 's',
  theme: 'system',
  highContrast: false,
  onboarded: false,
};

const STORAGE_KEY = 'prefs';

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** Accepts whatever was stored (possibly by an older version) and returns valid prefs. */
export function sanitizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    locale: oneOf(r.locale, ['ar', 'en'], DEFAULT_PREFS.locale),
    mobility: oneOf(r.mobility, ['walk', 'wheelchair', 'stroller'], DEFAULT_PREFS.mobility),
    voice: typeof r.voice === 'boolean' ? r.voice : DEFAULT_PREFS.voice,
    rate: oneOf(r.rate, ['slow', 'normal', 'fast'], DEFAULT_PREFS.rate),
    textSize: oneOf(r.textSize, ['s', 'm', 'l'], DEFAULT_PREFS.textSize),
    theme: oneOf(r.theme, ['system', 'light', 'dark'], DEFAULT_PREFS.theme),
    highContrast: typeof r.highContrast === 'boolean' ? r.highContrast : DEFAULT_PREFS.highContrast,
    onboarded: typeof r.onboarded === 'boolean' ? r.onboarded : DEFAULT_PREFS.onboarded,
  };
}

type Action = { type: 'set'; patch: Partial<Prefs> } | { type: 'reset' };

function reducer(state: Prefs, action: Action): Prefs {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'reset':
      return { ...DEFAULT_PREFS, onboarded: true, locale: state.locale };
  }
}

interface PrefsValue {
  readonly prefs: Prefs;
  set(patch: Partial<Prefs>): void;
  reset(): void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, dispatch] = useReducer(reducer, undefined, () =>
    sanitizePrefs(readJSON(STORAGE_KEY, {})),
  );
  const appliedTheme = useRef(false);

  useEffect(() => writeJSON(STORAGE_KEY, prefs), [prefs]);

  // Reflect preferences on <html> so CSS tokens, direction and screen readers follow.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = prefs.locale;
    root.dir = prefs.locale === 'ar' ? 'rtl' : 'ltr';
    root.dataset.text = prefs.textSize;
    if (prefs.highContrast) root.dataset.contrast = 'high';
    else delete root.dataset.contrast;
    if (prefs.theme !== 'system') {
      root.dataset.theme = prefs.theme;
      appliedTheme.current = true;
    } else if (appliedTheme.current) {
      // Only remove a theme we set ourselves, never one the host page chose.
      delete root.dataset.theme;
      appliedTheme.current = false;
    }
  }, [prefs.locale, prefs.textSize, prefs.highContrast, prefs.theme]);

  const set = useCallback((patch: Partial<Prefs>) => dispatch({ type: 'set', patch }), []);
  const reset = useCallback(() => {
    removeKey(STORAGE_KEY);
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo(() => ({ prefs, set, reset }), [prefs, set, reset]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return value;
}
