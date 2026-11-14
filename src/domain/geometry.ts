import { CORRIDOR_NODES } from './floorPlate';
import type { Place, Point } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function nodePoint(key: string): Point {
  const point = CORRIDOR_NODES[key];
  if (!point) throw new Error(`Unknown corridor node: ${key}`);
  return point;
}

/** Visual centre of a place: the middle of its room, or its marker point. */
export function placeCenter(place: Place): Point {
  if (place.rect) {
    return { x: place.rect.x + place.rect.w / 2, y: place.rect.y + place.rect.h / 2 };
  }
  return place.point ?? nodePoint(place.node);
}

/** Where the room's door meets the corridor: its node clamped onto the room outline. */
export function doorPoint(place: Place): Point {
  const node = nodePoint(place.node);
  const { rect } = place;
  if (!rect) return place.point ?? node;
  return {
    x: clamp(node.x, rect.x, rect.x + rect.w),
    y: clamp(node.y, rect.y, rect.y + rect.h),
  };
}
