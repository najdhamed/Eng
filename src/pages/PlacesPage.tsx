import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { PlaceRow } from '../components/PlaceRow';
import { SearchField } from '../components/SearchField';
import { DESTINATIONS } from '../domain/hospital';
import { FLOORS, type Place } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import { travelFrom } from '../navigation/planner';
import type { RouteName } from '../router/useHashRoute';
import { searchPlaces } from '../search/searchPlaces';
import { useJourney } from '../state/JourneyContext';
import { usePrefs } from '../state/PrefsContext';
import { CATEGORY_FILTERS, useCategoryLabels, type CategoryFilter } from './useCategoryLabels';

export function PlacesPage({ navigate }: { navigate: (route: RouteName) => void }) {
  const tr = useI18n();
  const { prefs } = usePrefs();
  const journey = useJourney();
  const categories = useCategoryLabels();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const travel = useMemo(
    () => travelFrom(journey.start.id, prefs.mobility),
    [journey.start.id, prefs.mobility],
  );
  const results = useMemo(() => {
    const matches = searchPlaces(query, DESTINATIONS, categories, tr.locale);
    return filter === 'all' ? matches : matches.filter((place) => place.category === filter);
  }, [query, filter, categories, tr.locale]);

  const searching = query.trim().length > 0;
  const byFloor = FLOORS.map((floor) => ({
    floor,
    places: results.filter((place) => place.floor === floor),
  })).filter((group) => group.places.length > 0);

  const go = (place: Place) => {
    journey.go(place.id);
    navigate('route');
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 id="page-title" tabIndex={-1}>
          {tr.t('places.title')}
        </h1>
        <p className="page-head__sub">{tr.t('places.sub')}</p>
      </header>

      <SearchField
        value={query}
        onChange={setQuery}
        controls="place-results"
        onSubmit={() => results[0] && go(results[0])}
      />

      <div className="chips" role="group" aria-label={tr.t('places.filter')}>
        {CATEGORY_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className="chip-btn"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {tr.t(`cat.${value}`)}
          </button>
        ))}
      </div>

      <div id="place-results" aria-live="polite">
        {results.length === 0 ? (
          <div className="empty card">
            <Icon name="search" size={32} />
            <p className="empty__title">{tr.t('places.empty', { query })}</p>
            <p>{tr.t('places.emptyHint')}</p>
          </div>
        ) : searching ? (
          <ul className="list card">
            {results.map((place) => (
              <li key={place.id}>
                <PlaceRow place={place} metrics={travel.get(place.id)} onSelect={go} />
              </li>
            ))}
          </ul>
        ) : (
          byFloor.map(({ floor, places }) => (
            <section key={floor} className="floor-group" aria-labelledby={`floor-${floor}`}>
              <h2 id={`floor-${floor}`} className="floor-group__title">
                <span className="floor-group__num">{tr.floorShort(floor)}</span>
                {tr.floorName(floor)}
                <span className="floor-group__count">{tr.count('places', places.length)}</span>
              </h2>
              <ul className="list card">
                {places.map((place) => (
                  <li key={place.id}>
                    <PlaceRow
                      place={place}
                      metrics={travel.get(place.id)}
                      onSelect={go}
                      showFloor={false}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
