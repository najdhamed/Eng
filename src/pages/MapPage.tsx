import { useMemo, useState } from 'react';
import { FloorMap } from '../components/FloorMap';
import { FloorSwitcher } from '../components/FloorSwitcher';
import { Icon } from '../components/Icon';
import { MapViewport } from '../components/MapViewport';
import { Pictogram, toneFor } from '../components/Pictogram';
import { PlaceRow } from '../components/PlaceRow';
import { placeCenter } from '../domain/geometry';
import { DESTINATIONS, FLOOR_THEMES } from '../domain/hospital';
import type { FloorId, Place } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import { travelFrom } from '../navigation/planner';
import type { RouteName } from '../router/useHashRoute';
import { useJourney } from '../state/JourneyContext';
import { usePrefs } from '../state/PrefsContext';
import { useToast } from '../state/ToastContext';

export function MapPage({ navigate }: { navigate: (route: RouteName) => void }) {
  const tr = useI18n();
  const { prefs } = usePrefs();
  const journey = useJourney();
  const toast = useToast();
  const [floor, setFloor] = useState<FloorId>(journey.state.browseFloor ?? journey.start.floor);
  const [selected, setSelected] = useState<Place | null>(null);

  const travel = useMemo(
    () => travelFrom(journey.start.id, prefs.mobility),
    [journey.start.id, prefs.mobility],
  );
  const onFloor = DESTINATIONS.filter((place) => place.floor === floor);
  const you = journey.start.floor === floor ? placeCenter(journey.start) : null;
  const metrics = selected ? travel.get(selected.id) : undefined;

  const changeFloor = (next: FloorId) => {
    setFloor(next);
    setSelected(null);
    journey.browse(next);
  };

  return (
    <div className="page page--wide">
      <header className="page-head">
        <h1 id="page-title" tabIndex={-1}>
          {tr.t('map.title')}
        </h1>
        <p className="page-head__sub">{tr.t('map.sub')}</p>
      </header>

      <div className="explore">
        <div className="explore__main">
          <FloorSwitcher value={floor} onChange={changeFloor} youFloor={journey.start.floor} />
          <section className="explore__map card">
            <div className="explore__floor">
              <strong>{tr.floorName(floor)}</strong>
              <span>{tr.name(FLOOR_THEMES[floor])}</span>
            </div>
            <MapViewport
              label={tr.t('a11y.mapOf', { floor: tr.floorName(floor) })}
              focus={
                selected
                  ? { ...placeCenter(selected), scale: 1.5, key: selected.id }
                  : { x: 300, y: 450, scale: 1, key: floor }
              }
            >
              <FloorMap
                floor={floor}
                you={you}
                highlightId={selected?.id ?? null}
                onSelect={setSelected}
              />
            </MapViewport>
          </section>
        </div>

        <div className="explore__side">
          {selected ? (
            <section className="place-card card" aria-live="polite">
              <div className="place-card__head">
                <Pictogram icon={selected.icon} tone={toneFor(selected.category)} size="lg" />
                <div>
                  <h2 className="place-card__name">{tr.name(selected.name)}</h2>
                  <p className="place-card__meta">
                    {tr.floorName(selected.floor)}
                    {metrics && ` · ${tr.t('home.away', { time: tr.duration(metrics.seconds) })}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn icon-btn--ghost"
                  aria-label={tr.t('a11y.close')}
                  onClick={() => setSelected(null)}
                >
                  <Icon name="close" />
                </button>
              </div>
              {selected.hours && (
                <p className="chip">
                  <Icon name="clock" size={14} /> {tr.name(selected.hours)}
                </p>
              )}
              <div className="place-card__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--grow"
                  onClick={() => {
                    journey.go(selected.id);
                    navigate('route');
                  }}
                >
                  <Icon name="route" />
                  {tr.t('map.guide')}
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    journey.setStart(selected.id);
                    toast.show(tr.t('toast.locationSet', { place: tr.name(selected.name) }));
                    setSelected(null);
                  }}
                >
                  <Icon name="locate" />
                  {tr.t('map.setHere')}
                </button>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="floor-list-title">
            <h2 id="floor-list-title" className="section-title">
              {tr.t('map.onThisFloor', { floor: tr.floorName(floor) })}
            </h2>
            <ul className="list card">
              {onFloor.map((place) => (
                <li key={place.id}>
                  <PlaceRow
                    place={place}
                    metrics={travel.get(place.id)}
                    onSelect={setSelected}
                    showFloor={false}
                    selected={selected?.id === place.id}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
