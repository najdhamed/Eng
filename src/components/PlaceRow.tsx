import type { Place } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import type { RouteMetrics } from '../navigation/planner';
import { Icon } from './Icon';
import { Pictogram, toneFor } from './Pictogram';

interface PlaceRowProps {
  readonly place: Place;
  readonly metrics?: RouteMetrics;
  readonly onSelect: (place: Place) => void;
  readonly showFloor?: boolean;
  readonly selected?: boolean;
}

export function PlaceRow({ place, metrics, onSelect, showFloor = true, selected }: PlaceRowProps) {
  const tr = useI18n();
  const meta = [
    showFloor && tr.floorName(place.floor),
    metrics && tr.t('home.away', { time: tr.duration(metrics.seconds) }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className={selected ? 'place-row is-selected' : 'place-row'}
      aria-current={selected || undefined}
      onClick={() => onSelect(place)}
    >
      <Pictogram icon={place.icon} tone={toneFor(place.category)} />
      <span className="place-row__body">
        <span className="place-row__name">{tr.name(place.name)}</span>
        {meta && <span className="place-row__meta">{meta}</span>}
        {place.hours && (
          <span className="place-row__hours">
            <Icon name="clock" size={14} /> {tr.name(place.hours)}
          </span>
        )}
      </span>
      <Icon
        name={tr.dir === 'rtl' ? 'chevronLeft' : 'chevronRight'}
        className="place-row__chevron"
        size={20}
      />
    </button>
  );
}
