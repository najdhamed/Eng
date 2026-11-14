import type { IconName } from '../icons/paths';

export type Locale = 'ar' | 'en';
export type Localized = Readonly<Record<Locale, string>>;

export type FloorId = 0 | 1 | 2 | 3 | 4;
export const FLOORS: readonly FloorId[] = [0, 1, 2, 3, 4];

export type Category =
  | 'emergency'
  | 'clinic'
  | 'diagnostic'
  | 'service'
  | 'facility'
  | 'ward'
  | 'core'
  | 'entrance'
  | 'exit';

export type Amenity = 'restroom' | 'prayer' | 'water' | 'seating' | 'exit' | 'wheelchair';

/** How the visitor moves. Anything but `walk` must never be routed over stairs. */
export type Mobility = 'walk' | 'wheelchair' | 'stroller';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Place {
  /** Stable id, also printed into the place's QR sign (`darbak:<id>`). */
  readonly id: string;
  readonly floor: FloorId;
  readonly name: Localized;
  /** Shorter label for the floor map when the full name does not fit. */
  readonly short?: Localized;
  readonly category: Category;
  readonly icon: IconName;
  /** Key of the corridor node a visitor stands on in front of this place. */
  readonly node: string;
  /** Room footprint in map units. Entrances and exits are points instead. */
  readonly rect?: Rect;
  readonly point?: Point;
  readonly amenities?: readonly Amenity[];
  readonly hours?: Localized;
  /** Extra search words and common misspellings, in either language. */
  readonly keywords?: readonly string[];
}
