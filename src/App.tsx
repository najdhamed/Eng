import { lazy, Suspense, useEffect, useRef } from 'react';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { Onboarding } from './components/Onboarding';
import { findPlace } from './domain/hospital';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { HomePage } from './pages/HomePage';
import { LostPage } from './pages/LostPage';
import { MapPage } from './pages/MapPage';
import { PlacesPage } from './pages/PlacesPage';
import { PrefsPage } from './pages/PrefsPage';
import { RoutePage } from './pages/RoutePage';
import { useHashRoute } from './router/useHashRoute';
import { JourneyProvider, useJourney } from './state/JourneyContext';
import { PrefsProvider, usePrefs } from './state/PrefsContext';
import { ToastProvider, useToast } from './state/ToastContext';

// Staff-only pages (and the QR generator they need) load when first opened.
const SignsPage = lazy(() => import('./pages/SignsPage').then((m) => ({ default: m.SignsPage })));

function Shell() {
  const [{ route, herePlaceId }, navigate] = useHashRoute();
  const { prefs } = usePrefs();
  const journey = useJourney();
  const toast = useToast();
  const tr = useI18n();
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // A QR sign opened with the phone's camera app lands on #here-<id>.
  useEffect(() => {
    const place = findPlace(herePlaceId);
    if (!place) return;
    journey.setStart(place.id);
    toast.show(tr.t('toast.locationSet', { place: tr.name(place.name) }));
    navigate(journey.destination ? 'route' : 'home');
  }, [herePlaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus to the new page's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }, [route]);

  const page = (() => {
    switch (route) {
      case 'home':
        return <HomePage navigate={navigate} />;
      case 'places':
        return <PlacesPage navigate={navigate} />;
      case 'map':
        return <MapPage navigate={navigate} />;
      case 'route':
        return <RoutePage navigate={navigate} />;
      case 'lost':
        return <LostPage navigate={navigate} />;
      case 'prefs':
        return <PrefsPage />;
      case 'signs':
        return <SignsPage />;
    }
  })();

  const focused = route === 'route';
  return (
    <div className={focused ? 'app app--focused' : 'app'}>
      <a
        className="skip-link"
        href="#page-title"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('page-title')?.focus();
        }}
      >
        {tr.t('a11y.skip')}
      </a>
      {!focused && <Header route={route} />}
      <main ref={main} className="app__main" key={route}>
        <Suspense
          fallback={
            <p className="page-loading" role="status">
              {tr.t('app.loading')}
            </p>
          }
        >
          {page}
        </Suspense>
      </main>
      {!focused && <BottomNav route={route} />}
      {!prefs.onboarded && <Onboarding />}
    </div>
  );
}

export function App() {
  return (
    <PrefsProvider>
      <I18nProvider>
        <ToastProvider>
          <JourneyProvider>
            <Shell />
          </JourneyProvider>
        </ToastProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}
