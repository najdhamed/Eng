import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Pictogram } from '../components/Pictogram';
import { PlaceRow } from '../components/PlaceRow';
import { SearchField } from '../components/SearchField';
import { DESTINATIONS, FLOOR_THEMES, findPlace, getPlace } from '../domain/hospital';
import { FLOORS, type Amenity, type Place } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import type { IconName } from '../icons/paths';
import { nearestPlace, travelFrom } from '../navigation/planner';
import type { RouteName } from '../router/useHashRoute';
import { searchPlaces } from '../search/searchPlaces';
import { useJourney } from '../state/JourneyContext';
import { usePrefs } from '../state/PrefsContext';
import { useCategoryLabels } from './useCategoryLabels';

const QUICK: readonly { amenity: Amenity; label: MessageKey; icon: IconName }[] = [
  { amenity: 'restroom', label: 'home.nearest.restroom', icon: 'restroom' },
  { amenity: 'prayer', label: 'home.nearest.prayer', icon: 'prayer' },
  { amenity: 'water', label: 'home.nearest.water', icon: 'water' },
  { amenity: 'exit', label: 'home.nearest.exit', icon: 'exit' },
];

const MOBILITY_ICON = { walk: 'walk', wheelchair: 'wheelchair', stroller: 'stroller' } as const;

export function HomePage({ navigate }: { navigate: (route: RouteName) => void }) {
  const tr = useI18n();
  const { prefs } = usePrefs();
  const journey = useJourney();
  const categories = useCategoryLabels();
  const [query, setQuery] = useState('');

  const travel = useMemo(
    () => travelFrom(journey.start.id, prefs.mobility),
    [journey.start.id, prefs.mobility],
  );
  const results = useMemo(
    () =>
      query.trim() ? searchPlaces(query, DESTINATIONS, categories, tr.locale).slice(0, 5) : [],
    [query, categories, tr.locale],
  );
  const nearest = useMemo(
    () =>
      QUICK.map((quick) => ({
        ...quick,
        hit: nearestPlace(
          journey.start.id,
          prefs.mobility,
          (p) => p.amenities?.includes(quick.amenity) ?? false,
        ),
      })),
    [journey.start.id, prefs.mobility],
  );

  const go = (place: Place) => {
    journey.go(place.id);
    navigate('route');
  };
  const emergency = getPlace('0-emergency');
  const emergencyTime = travel.get(emergency.id);
  const recents = journey.state.recents.map(findPlace).filter((p): p is Place => Boolean(p));

  return (
    <div className="page page--home">
      <section className="hero" aria-labelledby="page-title">
        <p className="hero__greeting">{tr.t('home.greeting')}</p>
        <h1 id="page-title" className="hero__title" tabIndex={-1}>
          {tr.t('home.title')}
        </h1>
        <SearchField
          value={query}
          onChange={setQuery}
          controls="home-suggestions"
          onSubmit={() => {
            const [first] = results;
            if (first) go(first);
          }}
        />
        {query.trim() && (
          <div className="suggestions" id="home-suggestions">
            {results.length > 0 ? (
              <>
                <ul className="list">
                  {results.map((place) => (
                    <li key={place.id}>
                      <PlaceRow place={place} metrics={travel.get(place.id)} onSelect={go} />
                    </li>
                  ))}
                </ul>
                <a className="link-btn" href="#places">
                  {tr.t('home.seeAll')}
                </a>
              </>
            ) : (
              <p className="empty">{tr.t('places.empty', { query })}</p>
            )}
          </div>
        )}
      </section>

      <section className="here card" aria-label={tr.t('home.youAreAt')}>
        <Pictogram icon={journey.start.icon} tone="primary" size="lg" />
        <div className="here__body">
          <span className="here__label">{tr.t('home.youAreAt')}</span>
          <strong className="here__place">{tr.name(journey.start.name)}</strong>
          <span className="here__floor">{tr.floorName(journey.start.floor)}</span>
        </div>
        <div className="here__actions">
          <a className="btn btn--soft btn--sm" href="#lost">
            <Icon name="camera" size={18} />
            {tr.t('home.change')}
          </a>
        </div>
      </section>

      <button type="button" className="emergency" onClick={() => go(emergency)}>
        <Pictogram icon="emergency" tone="warn" size="xl" />
        <span className="emergency__text">
          <span className="emergency__title">{tr.t('home.emergency')}</span>
          <span className="emergency__sub">
            {tr.t('home.emergencySub')}
            {emergencyTime && ` · ${tr.duration(emergencyTime.seconds)}`}
          </span>
        </span>
        <Icon name={tr.dir === 'rtl' ? 'arrowLeft' : 'arrowRight'} size={28} strokeWidth={2.2} />
      </button>

      <section aria-labelledby="nearest-title">
        <h2 id="nearest-title" className="section-title">
          {tr.t('home.nearest')}
        </h2>
        <ul className="quick-grid">
          {nearest.map(({ amenity, label, icon, hit }) => (
            <li key={amenity}>
              <button
                type="button"
                className="quick"
                disabled={!hit}
                onClick={() => hit && go(hit.place)}
              >
                <Pictogram icon={icon} tone={amenity === 'exit' ? 'ok' : 'soft'} size="lg" />
                <span className="quick__name">{tr.t(label)}</span>
                {hit && (
                  <span className="quick__meta">
                    {tr.t('home.away', { time: tr.duration(hit.metrics.seconds) })}
                    {hit.place.floor !== journey.start.floor &&
                      ` · ${tr.floorShort(hit.place.floor)}`}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {recents.length > 0 && (
        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="section-title">
            <Icon name="history" size={20} /> {tr.t('home.recent')}
          </h2>
          <ul className="list card">
            {recents.map((place) => (
              <li key={place.id}>
                <PlaceRow place={place} metrics={travel.get(place.id)} onSelect={go} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mobility-strip card">
        <Icon name={MOBILITY_ICON[prefs.mobility]} size={28} />
        <span>
          {tr.t('home.mobility')} <strong>{tr.t(`mobility.${prefs.mobility}`)}</strong>
          <span className="mobility-strip__sub"> · {tr.t(`mobility.${prefs.mobility}Sub`)}</span>
        </span>
        <a className="link-btn" href="#prefs">
          {tr.t('home.mobilityChange')}
        </a>
      </section>

      <section aria-labelledby="floors-title">
        <h2 id="floors-title" className="section-title">
          <Icon name="building" size={20} /> {tr.t('home.floors')}
        </h2>
        <ol className="floor-directory card">
          {[...FLOORS].reverse().map((floor) => (
            <li key={floor}>
              <button
                type="button"
                className="floor-directory__row"
                onClick={() => {
                  journey.browse(floor);
                  navigate('map');
                }}
              >
                <span className="floor-directory__num">{tr.floorShort(floor)}</span>
                <span className="floor-directory__text">
                  <span className="floor-directory__name">{tr.floorName(floor)}</span>
                  <span className="floor-directory__theme">{tr.name(FLOOR_THEMES[floor])}</span>
                </span>
                {floor === journey.start.floor && (
                  <span className="chip chip--primary">{tr.t('map.you')}</span>
                )}
                <Icon name={tr.dir === 'rtl' ? 'chevronLeft' : 'chevronRight'} size={20} />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <p className="demo-note">
        <Icon name="info" size={16} /> {tr.t('app.demo')}
      </p>
    </div>
  );
}
