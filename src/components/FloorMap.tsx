import { memo, type KeyboardEvent } from 'react';
import { BUILDING, CORRIDORS } from '../domain/floorPlate';
import { placeCenter } from '../domain/geometry';
import { placesOnFloor } from '../domain/hospital';
import type { FloorId, Place, Point } from '../domain/types';
import { ICON_PATHS, type IconName } from '../icons/paths';
import { useI18n } from '../i18n/I18nContext';
import type { FloorRouteGeometry, RoutePoint } from '../navigation/geometry';

interface FloorMapProps {
  readonly floor: FloorId;
  readonly route?: FloorRouteGeometry;
  /** Route node index the visitor has reached; earlier parts are drawn as done. */
  readonly progressIndex?: number;
  readonly you?: Point | null;
  /** Draw the walked part of the route up to `you`, not just up to the last node. */
  readonly followYou?: boolean;
  readonly destinationId?: string | null;
  readonly highlightId?: string | null;
  readonly onSelect?: (place: Place) => void;
}

function MapIcon({ name, x, y, size }: { name: IconName; x: number; y: number; size: number }) {
  const scale = size / 24;
  return (
    <path
      className="map-room__icon"
      d={ICON_PATHS[name]}
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${scale})`}
      strokeWidth={1.75}
    />
  );
}

const toPath = (points: readonly RoutePoint[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

/**
 * Splits a run into the part already walked and the part still to go. With
 * `cut` (the live position between two nodes) the split falls exactly there.
 */
function split(run: readonly RoutePoint[], index: number, cut?: Point | null) {
  const done = run.filter((p) => p.index <= index);
  const rest = run.slice(done.length);
  const last = done[done.length - 1];
  if (cut && last && rest.length > 0 && Math.hypot(cut.x - last.x, cut.y - last.y) > 0.5) {
    const at = { x: cut.x, y: cut.y, index };
    return { done: [...done, at], todo: [at, ...rest] };
  }
  const todoStart = Math.max(0, done.length - 1);
  return { done, todo: run.slice(todoStart) };
}

function roomClass(place: Place, highlighted: boolean, destination: boolean) {
  const kind =
    place.category === 'emergency'
      ? 'emergency'
      : place.category === 'core'
        ? 'core'
        : place.category === 'facility'
          ? 'facility'
          : 'room';
  return [
    'map-room',
    `map-room--${kind}`,
    highlighted && 'is-highlighted',
    destination && 'is-destination',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A floor plan drawn in map units (600 × 900). Pan and zoom live in <MapViewport>. */
export const FloorMap = memo(function FloorMap({
  floor,
  route,
  progressIndex = -1,
  you,
  followYou = false,
  destinationId,
  highlightId,
  onSelect,
}: FloorMapProps) {
  const tr = useI18n();
  const places = placesOnFloor(floor);
  const corridor = floor === 0 ? CORRIDORS.mainGround : CORRIDORS.main;

  const select = (place: Place) => onSelect?.(place);
  const onKey = (event: KeyboardEvent, place: Place) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(place);
    }
  };

  return (
    <g className="floor-map">
      <rect
        className="map-building"
        x={BUILDING.x}
        y={BUILDING.y}
        width={BUILDING.w}
        height={BUILDING.h}
        rx={28}
      />
      <rect className="map-corridor" {...rectProps(CORRIDORS.north)} rx={10} />
      <rect className="map-corridor" {...rectProps(corridor)} rx={10} />

      {places
        .filter((place) => place.rect)
        .map((place) => {
          const rect = place.rect!;
          const c = placeCenter(place);
          const label = tr.name(place.short ?? place.name);
          const fullName = tr.name(place.name);
          // A button's name must contain the words printed on it.
          const spoken = fullName.includes(label) ? fullName : `${label}، ${fullName}`;
          const interactive = Boolean(onSelect) && place.category !== 'core';
          const isDestination = place.id === destinationId;
          const compact = rect.h < 120;
          return (
            <g
              key={place.id}
              className={roomClass(place, place.id === highlightId, isDestination)}
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${spoken}، ${tr.floorName(floor)}`,
                    onClick: () => select(place),
                    onKeyDown: (event: KeyboardEvent) => onKey(event, place),
                  }
                : { 'aria-hidden': true })}
            >
              <rect x={rect.x + 3} y={rect.y + 3} width={rect.w - 6} height={rect.h - 6} rx={16} />
              {!isDestination && (
                <MapIcon
                  name={place.icon}
                  x={c.x}
                  y={c.y - (compact ? 14 : 18)}
                  size={compact ? 26 : 32}
                />
              )}
              <text
                x={c.x}
                y={c.y + (compact ? 24 : 30)}
                textAnchor="middle"
                className="map-room__label"
              >
                {label}
              </text>
            </g>
          );
        })}

      {places
        .filter((place) => place.category === 'exit')
        .map((place) => {
          const c = placeCenter(place);
          return (
            <g key={place.id} className="map-exit" aria-hidden="true">
              <rect x={c.x - 15} y={c.y - 15} width={30} height={30} rx={8} />
              <MapIcon name="exit" x={c.x} y={c.y} size={20} />
            </g>
          );
        })}

      {floor === 0 && (
        <g className="map-entrance" aria-hidden="true">
          <rect x={262} y={872} width={76} height={12} rx={6} />
          <text x={300} y={898} textAnchor="middle" className="map-entrance__label">
            {tr.t('map.entrance')}
          </text>
        </g>
      )}

      {route?.runs.map((run, i) => {
        const { done, todo } = split(run, progressIndex, followYou ? you : null);
        return (
          <g key={i} className="map-route" aria-hidden="true">
            <path className="map-route__casing" d={toPath(run)} />
            {todo.length > 1 && <path className="map-route__todo" d={toPath(todo)} />}
            {todo.length > 1 && <path className="map-route__flow" d={toPath(todo)} />}
            {done.length > 1 && <path className="map-route__done" d={toPath(done)} />}
          </g>
        );
      })}

      {route?.destination && (
        <g
          className="map-pin"
          aria-hidden="true"
          transform={`translate(${route.destination.x - 20} ${route.destination.y - 58})`}
        >
          <path d="M20 54s-17-15-17-28a17 17 0 0 1 34 0c0 13-17 28-17 28z" />
          <circle cx={20} cy={26} r={7} />
        </g>
      )}

      {you && (
        <g className="map-you" aria-hidden="true" transform={`translate(${you.x} ${you.y})`}>
          <circle className="map-you__pulse" r={14} />
          <circle className="map-you__halo" r={20} />
          <circle className="map-you__dot" r={12} />
        </g>
      )}
    </g>
  );
});

function rectProps(rect: { x: number; y: number; w: number; h: number }) {
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
}
