import type { FloorId } from '../domain/types';
import { FLOORS } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

interface FloorSwitcherProps {
  readonly value: FloorId;
  readonly onChange: (floor: FloorId) => void;
  readonly youFloor?: FloorId | null;
  readonly destinationFloor?: FloorId | null;
  /** Floors the current route passes through, drawn with a route stripe. */
  readonly routeFloors?: readonly FloorId[];
}

/** Floors as a row of lift buttons, ground floor first. */
export function FloorSwitcher({
  value,
  onChange,
  youFloor,
  destinationFloor,
  routeFloors = [],
}: FloorSwitcherProps) {
  const tr = useI18n();
  return (
    <div className="floor-switcher" role="radiogroup" aria-label={tr.t('a11y.floors')}>
      <span className="floor-switcher__label" aria-hidden="true">
        <Icon name="layers" size={18} />
      </span>
      {FLOORS.map((floor) => {
        const notes = [
          floor === youFloor && tr.t('map.you'),
          floor === destinationFloor && tr.t('map.destination'),
        ].filter(Boolean);
        return (
          <button
            key={floor}
            type="button"
            role="radio"
            aria-checked={floor === value}
            aria-label={[tr.floorName(floor), ...notes].join('، ')}
            className={[
              'floor-btn',
              floor === value && 'is-selected',
              routeFloors.includes(floor) && 'is-on-route',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(floor)}
          >
            <span className="floor-btn__num">{tr.floorShort(floor)}</span>
            {floor === youFloor && <span className="floor-btn__you" aria-hidden="true" />}
            {floor === destinationFloor && (
              <span className="floor-btn__dest" aria-hidden="true">
                <Icon name="pin" size={12} strokeWidth={2.4} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
