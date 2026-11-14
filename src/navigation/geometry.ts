import { doorPoint, placeCenter } from '../domain/geometry';
import type { FloorId, Point } from '../domain/types';
import type { PlannedRoute } from './planner';

export interface RoutePoint extends Point {
  /** Index of the route node this point belongs to (used to split done / to-do). */
  readonly index: number;
}

export interface FloorRouteGeometry {
  /** Continuous runs of the route drawn on this floor. */
  readonly runs: readonly (readonly RoutePoint[])[];
  readonly destination?: Point;
  readonly start?: Point;
}

/** The parts of a route that lie on `floor`, ready for the floor map to draw. */
export function routeOnFloor(route: PlannedRoute, floor: FloorId): FloorRouteGeometry {
  const runs: RoutePoint[][] = [];
  let current: RoutePoint[] = [];
  const last = route.nodes.length - 1;

  route.nodes.forEach((node, index) => {
    const onFloor = node.floor === floor;
    const continues = index > 0 && route.edges[index - 1]?.kind === 'walk';
    if (!onFloor || !continues) {
      if (current.length > 1) runs.push(current);
      current = [];
    }
    if (!onFloor) return;
    if (current.length === 0 && index === 0 && route.start.rect && route.start.floor === floor) {
      current.push({ ...doorPoint(route.start), index: 0 });
    }
    current.push({ x: node.x, y: node.y, index });
    if (index === last && route.destination.floor === floor && route.destination.rect) {
      current.push({ ...doorPoint(route.destination), index });
    }
  });
  if (current.length > 1) runs.push(current);

  return {
    runs,
    ...(route.destination.floor === floor ? { destination: placeCenter(route.destination) } : {}),
    ...(route.start.floor === floor ? { start: placeCenter(route.start) } : {}),
  };
}
