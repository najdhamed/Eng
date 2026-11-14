import { useState } from 'react';
import { placesOnFloor } from '../domain/hospital';
import { FLOORS, type FloorId, type Place } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import { Pictogram, toneFor } from './Pictogram';
import { Segmented } from './Segmented';

interface PlacePickerProps {
  readonly initialFloor: FloorId;
  readonly onPick: (place: Place) => void;
  readonly title?: string;
}

/** "Which place can you see?" — choose a floor, then tap the sign in front of you. */
export function PlacePicker({ initialFloor, onPick, title }: PlacePickerProps) {
  const tr = useI18n();
  const [floor, setFloor] = useState<FloorId>(initialFloor);
  const places = placesOnFloor(floor).filter((place) => place.category !== 'exit');

  return (
    <div className="picker">
      {title && <h2 className="section-title">{title}</h2>}
      <Segmented
        label={tr.t('lost.whichFloor')}
        value={floor}
        onChange={setFloor}
        variant="floors"
        options={FLOORS.map((f) => ({ value: f, label: tr.floorShort(f) }))}
      />
      <ul className="tile-grid" aria-label={tr.floorName(floor)}>
        {places.map((place) => (
          <li key={place.id}>
            <button type="button" className="tile" onClick={() => onPick(place)}>
              <Pictogram icon={place.icon} tone={toneFor(place.category)} size="lg" />
              <span className="tile__name">{tr.name(place.short ?? place.name)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
