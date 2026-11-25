import { Component, type ErrorInfo, type ReactNode } from 'react';

type Language = 'ar' | 'en';

const COPY: Record<
  Language,
  { title: string; body: string; reload: string; reset: string; dir: 'rtl' | 'ltr' }
> = {
  ar: {
    dir: 'rtl',
    title: 'صار عندنا خلل بسيط',
    body: 'ما قدرنا نعرض الصفحة. حدّث الصفحة وجرّب من جديد. وإذا تكرر الخلل، امسح البيانات المحفوظة وابدأ من أول.',
    reload: 'حدّث الصفحة',
    reset: 'امسح البيانات المحفوظة وابدأ من جديد',
  },
  en: {
    dir: 'ltr',
    title: 'Something went wrong',
    body: 'We could not show this page. Reload it and try again. If it keeps happening, clear the saved data and start fresh.',
    reload: 'Reload the page',
    reset: 'Clear saved data and start again',
  },
};

export const crashCopy = (language: string | null | undefined) =>
  COPY[language === 'en' ? 'en' : 'ar'];

/**
 * Forgets what Darbak saved on this device (settings and the current journey),
 * which is the one thing that can make a crash repeat. The voice recordings in
 * IndexedDB are left alone: they took people a long time to make.
 */
export function clearSavedSettings(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith('darbak:')) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

interface State {
  readonly failed: boolean;
}

/** A white screen is the worst thing a lost visitor can meet, so a crash always shows a way out. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Darbak crashed:', error, info.componentStack);
  }

  private reset = () => {
    try {
      clearSavedSettings(window.localStorage);
    } catch {
      // Storage is unavailable, so there is nothing saved that could be at fault.
    }
    window.location.hash = '#home';
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const copy = crashCopy(document.documentElement.lang);
    return (
      <main className="crash" role="alert" dir={copy.dir} lang={document.documentElement.lang}>
        <h1 id="page-title" className="crash__title" tabIndex={-1}>
          {copy.title}
        </h1>
        <p className="crash__body">{copy.body}</p>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => location.reload()}
        >
          {copy.reload}
        </button>
        <button type="button" className="btn btn--outline" onClick={this.reset}>
          {copy.reset}
        </button>
      </main>
    );
  }
}
