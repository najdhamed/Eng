import { MIN_STEP_METERS } from '../config';
import { doorPoint, placeCenter } from '../domain/geometry';
import type { FloorId, Localized, Place, Point } from '../domain/types';
import type { GraphEdge, GraphNode } from './graph';

/**
 * Turns a path through the corridor graph into the steps a person follows.
 *
 * Headings use map coordinates (y grows downward, "north" is up), so for a
 * walker facing `h` who then moves along `d`, cross(h, d) > 0 is a right turn.
 */

export type Turn = 'straight' | 'left' | 'right' | 'back';
export type Side = 'left' | 'right' | 'ahead';

interface StepBase {
  readonly floor: FloorId;
  /** Where the visitor stands when this step begins. */
  readonly at: Point;
  /** Index into the route's node list where this step begins. */
  readonly pathIndex: number;
}

export interface StartStep extends StepBase {
  readonly kind: 'start';
  readonly place: Place;
}

export interface WalkStep extends StepBase {
  readonly kind: 'walk';
  readonly turn: Turn;
  readonly meters: number;
  /** A landmark at the end of this walk ("…until you reach the lifts"). */
  readonly toward?: Localized;
  /** Set on the last walk: which side the destination appears on. */
  arrivalSide?: Side;
}

export interface TransferStep extends StepBase {
  readonly kind: 'lift' | 'stairs';
  readonly fromFloor: FloorId;
  readonly toFloor: FloorId;
  /** The short turn into the lift lobby or stairwell, folded into this step. */
  readonly approach?: Exclude<Turn, 'straight'>;
}

export interface ArriveStep extends StepBase {
  readonly kind: 'arrive';
  readonly place: Place;
  readonly side: Side;
}

export type Step = StartStep | WalkStep | TransferStep | ArriveStep;

interface Vec {
  x: number;
  y: number;
}

const sub = (a: Point, b: Point): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const length = (v: Vec) => Math.hypot(v.x, v.y);
const unit = (v: Vec): Vec => {
  const l = length(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

const NORTH: Vec = { x: 0, y: -1 };
/** People leave the lifts (east side) facing west, and the stairs (west side) facing east. */
const EXIT_HEADING: Record<'lift' | 'stairs', Vec> = {
  lift: { x: -1, y: 0 },
  stairs: { x: 1, y: 0 },
};

export function classifyTurn(heading: Vec, next: Vec): Turn {
  const d = dot(heading, next);
  if (d > 0.7) return 'straight';
  if (d < -0.7) return 'back';
  return cross(heading, next) > 0 ? 'right' : 'left';
}

export function sideOf(heading: Vec, from: Point, target: Point): Side {
  const towards = sub(target, from);
  if (length(towards) < 1) return 'ahead';
  const c = cross(heading, unit(towards));
  if (Math.abs(c) < 0.4) return 'ahead';
  return c > 0 ? 'right' : 'left';
}

/** The direction a visitor faces as they set off from a place. */
export function initialHeading(start: Place, firstNode: Point & { key?: string }): Vec {
  if (start.category === 'entrance') return NORTH;
  if (firstNode.key === 'lift') return EXIT_HEADING.lift;
  if (firstNode.key === 'stairs') return EXIT_HEADING.stairs;
  const out = sub(firstNode, placeCenter(start));
  return length(out) < 1 ? NORTH : unit(out);
}

const point = (p: Point): Point => ({ x: p.x, y: p.y });

export function buildSteps(
  start: Place,
  destination: Place,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Step[] {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last || edges.length !== nodes.length - 1) {
    throw new Error('buildSteps needs a path with one more node than edges');
  }

  const steps: Step[] = [
    { kind: 'start', place: start, floor: start.floor, at: placeCenter(start), pathIndex: 0 },
  ];
  let heading = initialHeading(start, first);
  let approach: TransferStep['approach'];
  let i = 0;

  while (i < edges.length) {
    const edge = edges[i]!;
    const from = nodes[i]!;

    if (edge.kind !== 'walk') {
      let j = i;
      while (edges[j + 1]?.kind === edge.kind) j += 1;
      steps.push({
        kind: edge.kind,
        fromFloor: from.floor,
        toFloor: nodes[j + 1]!.floor,
        floor: from.floor,
        at: point(from),
        pathIndex: i,
        ...(approach ? { approach } : {}),
      });
      approach = undefined;
      heading = EXIT_HEADING[edge.kind];
      i = j + 1;
      continue;
    }

    // Merge consecutive walking edges that keep the same direction.
    const direction = unit(sub(nodes[i + 1]!, from));
    let meters = edge.meters;
    let j = i;
    while (edges[j + 1]?.kind === 'walk') {
      const nextDirection = unit(sub(nodes[j + 2]!, nodes[j + 1]!));
      if (dot(nextDirection, direction) < 0.99) break;
      j += 1;
      meters += edges[j]!.meters;
    }

    const turn = classifyTurn(heading, direction);
    const endsRoute = j + 1 === edges.length;
    const leadsToTransfer = edges[j + 1] !== undefined && edges[j + 1]!.kind !== 'walk';
    heading = direction;

    if (meters < MIN_STEP_METERS && !endsRoute) {
      // A few metres to the lift door or out of a stairwell is not worth its own step.
      if (leadsToTransfer && turn !== 'straight') approach = turn;
      i = j + 1;
      continue;
    }

    const landmark = endsRoute ? undefined : nodes[j + 1]!.label;
    steps.push({
      kind: 'walk',
      turn,
      meters,
      floor: from.floor,
      at: point(from),
      pathIndex: i,
      ...(landmark ? { toward: landmark } : {}),
    });
    i = j + 1;
  }

  const side = destination.rect ? sideOf(heading, last, placeCenter(destination)) : 'ahead';
  const previous = steps[steps.length - 1];
  if (previous?.kind === 'walk') previous.arrivalSide = side;

  steps.push({
    kind: 'arrive',
    place: destination,
    side,
    floor: destination.floor,
    at: doorPoint(destination),
    pathIndex: nodes.length - 1,
  });
  return steps;
}
