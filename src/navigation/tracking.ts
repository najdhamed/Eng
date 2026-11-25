import { SPEED_MPS } from '../config';
import type { FloorId, Mobility, Point } from '../domain/types';
import type { PlannedRoute } from './planner';

/**
 * Live tracking along a planned route.
 *
 * Phones cannot see the inside of a building, so Darbak does not pretend to
 * know an absolute position. It measures how far the person has walked (from
 * step counts, GPS or a demo walker) and matches that distance against the
 * route it already planned: the same idea as map matching in a car. The route
 * is a chain of walking edges, with lift or stairs edges where the floor
 * changes. Walking consumes edge length; a floor change cannot be sensed, so
 * the tracker waits there until the person confirms (or scans a sign).
 *
 * Everything in this file is pure: a state, a few transitions and a view.
 */

/** A step is announced this many metres before the corner it describes. */
export const LEAD_METERS = 4;
/** The "start" step stays until the person has really set off. */
export const START_MOVE_METERS = 1.5;
/** The "arrive" step appears this far from the end of the route. */
export const ARRIVE_LEAD_METERS = 6;
/** Counted as arrived this close to the end (step counts are never exact). */
export const ARRIVE_TOLERANCE_METERS = 2;

export type TrackerPhase = 'walking' | 'awaitingFloor' | 'arrived';

export interface TrackerState {
  /** Index of the route edge the person is on (edges.length once they are at the end). */
  readonly edge: number;
  /** Metres walked along that edge (always 0 on a lift or stairs edge). */
  readonly along: number;
  readonly phase: TrackerPhase;
  /** The step can only move forward from here; set by manual Next/Back and floor changes. */
  readonly held: number;
}

export interface TrackerView {
  /** Where to draw the "you are here" dot. */
  readonly point: Point;
  readonly floor: FloorId;
  /** The last route node the person has passed (splits "done" from "to do" on the map). */
  readonly nodeIndex: number;
  /** The index of the step to show and speak. */
  readonly stepIndex: number;
  /** Metres walked along the route so far, and in total. */
  readonly progress: number;
  readonly total: number;
  readonly remaining: number;
  readonly phase: TrackerPhase;
  /** Set while waiting for the person to confirm a floor change. */
  readonly transfer: { readonly kind: 'lift' | 'stairs'; readonly toFloor: FloorId } | null;
}

export interface PathModel {
  readonly route: PlannedRoute;
  /** Metres walked on arrival at each node. */
  readonly cumulative: readonly number[];
  readonly total: number;
  /** Node index at which each step begins. */
  readonly stepNode: readonly number[];
  /** Metres at which each step is announced. */
  readonly reach: readonly number[];
}

const paths = new WeakMap<PlannedRoute, PathModel>();

export function pathFor(route: PlannedRoute): PathModel {
  const cached = paths.get(route);
  if (cached) return cached;

  const cumulative: number[] = [0];
  for (const edge of route.edges) {
    cumulative.push(cumulative[cumulative.length - 1]! + (edge.kind === 'walk' ? edge.meters : 0));
  }
  const total = cumulative[cumulative.length - 1]!;
  const stepNode = route.steps.map((step) => step.pathIndex);
  const last = route.steps.length - 1;
  const reach = route.steps.map((step, i) => {
    const at = cumulative[step.pathIndex] ?? total;
    if (i === 0) return Number.NEGATIVE_INFINITY;
    if (i === last) {
      // A short last leg must still be shown before "you have arrived".
      const legStart = cumulative[route.steps[i - 1]!.pathIndex] ?? 0;
      return at - Math.min(ARRIVE_LEAD_METERS, Math.max(0, at - legStart) / 2);
    }
    if (i === 1) return step.kind === 'walk' ? Math.max(at - LEAD_METERS, START_MOVE_METERS) : 0;
    return Math.max(0, at - LEAD_METERS);
  });

  const model: PathModel = { route, cumulative, total, stepNode, reach };
  paths.set(route, model);
  return model;
}

export function startState(route: PlannedRoute): TrackerState {
  const first = route.edges[0];
  const phase: TrackerPhase = !first
    ? 'arrived'
    : first.kind === 'walk'
      ? 'walking'
      : 'awaitingFloor';
  return { edge: 0, along: 0, phase, held: 0 };
}

/** The edge index of the next lift or stairs edge at or after `from` (Infinity if none). */
function nextTransfer(route: PlannedRoute, from: number): number {
  for (let i = from; i < route.edges.length; i += 1) {
    if (route.edges[i]!.kind !== 'walk') return i;
  }
  return Number.POSITIVE_INFINITY;
}

/** Moves the person `meters` further along the route. Stops at floor changes and at the end. */
export function advance(route: PlannedRoute, state: TrackerState, meters: number): TrackerState {
  if (state.phase !== 'walking' || !(meters > 0)) return state;

  let { edge, along } = state;
  let left = meters;
  const { edges } = route;

  while (edge < edges.length) {
    const current = edges[edge]!;
    if (current.kind !== 'walk') return { ...state, edge, along: 0, phase: 'awaitingFloor' };
    const room = current.meters - along;
    if (left < room) {
      along += left;
      left = 0;
      break;
    }
    left -= room;
    edge += 1;
    along = 0;
    if (left === 0 && edge < edges.length && edges[edge]!.kind !== 'walk') {
      return { ...state, edge, along: 0, phase: 'awaitingFloor' };
    }
  }

  if (edge >= edges.length) return { ...state, edge: edges.length, along: 0, phase: 'arrived' };

  const model = pathFor(route);
  const walked = model.cumulative[edge]! + along;
  if (model.total - walked <= ARRIVE_TOLERANCE_METERS && nextTransfer(route, edge) === Infinity) {
    return { ...state, edge: edges.length, along: 0, phase: 'arrived' };
  }
  return { ...state, edge, along };
}

/** The person says (or a sign shows) that they are on the new floor. */
export function confirmFloorChange(route: PlannedRoute, state: TrackerState): TrackerState {
  if (state.phase !== 'awaitingFloor') return state;
  const kind = route.edges[state.edge]?.kind;
  let edge = state.edge;
  while (route.edges[edge]?.kind === kind) edge += 1;

  const after = route.steps.findIndex((step) => step.pathIndex >= edge && step.kind !== 'start');
  const held = Math.max(state.held, after === -1 ? route.steps.length - 1 : after);
  if (edge >= route.edges.length)
    return { edge: route.edges.length, along: 0, phase: 'arrived', held };
  const next = route.edges[edge]!.kind === 'walk' ? 'walking' : 'awaitingFloor';
  return { edge, along: 0, phase: next, held };
}

/** Puts the tracker at the start of a step: used by Next, Back and tapping a step in the list. */
export function jumpToStep(route: PlannedRoute, index: number): TrackerState {
  const clamped = Math.min(Math.max(0, index), route.steps.length - 1);
  const step = route.steps[clamped]!;
  const edge = Math.min(step.pathIndex, route.edges.length);
  const onTransfer = route.edges[edge]?.kind !== undefined && route.edges[edge]!.kind !== 'walk';
  const phase: TrackerPhase =
    edge >= route.edges.length
      ? 'arrived'
      : onTransfer && step.kind !== 'walk'
        ? 'awaitingFloor'
        : 'walking';
  return { edge, along: 0, phase: step.kind === 'arrive' ? 'arrived' : phase, held: clamped };
}

/**
 * Puts the person exactly at a route node: used when they scan a sign or say
 * "I am here". A node reached by lift or stairs means they have already
 * changed floor, so the step that described the ride is behind them.
 */
export function stateAtNode(route: PlannedRoute, nodeIndex: number): TrackerState {
  let edge = Math.min(Math.max(0, Math.round(nodeIndex)), route.edges.length);
  // Halfway up a two-floor stairway is nowhere anyone stands: count it as the top.
  while (
    edge > 0 &&
    edge < route.edges.length &&
    route.edges[edge - 1]!.kind !== 'walk' &&
    route.edges[edge]!.kind === route.edges[edge - 1]!.kind
  ) {
    edge += 1;
  }
  const here = route.edges[edge];
  const phase: TrackerPhase = !here
    ? 'arrived'
    : here.kind === 'walk'
      ? 'walking'
      : 'awaitingFloor';
  const justRode = edge > 0 && route.edges[edge - 1]!.kind !== 'walk';

  let held = 0;
  if (justRode) {
    const next = route.steps.findIndex((step) => step.pathIndex >= edge && step.kind !== 'start');
    held = next === -1 ? route.steps.length - 1 : next;
  } else {
    route.steps.forEach((step, i) => {
      if (step.pathIndex <= edge && (step.kind !== 'arrive' || phase === 'arrived')) held = i;
    });
  }
  return { edge, along: 0, phase, held };
}

export function view(route: PlannedRoute, state: TrackerState): TrackerView {
  const model = pathFor(route);
  const { nodes, edges, steps } = route;
  const edge = Math.min(state.edge, edges.length);
  const from = nodes[edge]!;
  const to = nodes[edge + 1];
  const current = edges[edge];

  let point: Point = { x: from.x, y: from.y };
  if (to && current?.kind === 'walk' && current.meters > 0) {
    const t = Math.min(1, state.along / current.meters);
    point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  const progress = model.cumulative[edge]! + (current?.kind === 'walk' ? state.along : 0);
  const barrier = state.phase === 'awaitingFloor' ? edge : nextTransfer(route, edge);
  let stepIndex = state.held;
  for (let i = steps.length - 1; i > stepIndex; i -= 1) {
    if (model.stepNode[i]! <= barrier && model.reach[i]! <= progress) {
      stepIndex = i;
      break;
    }
  }
  if (state.phase === 'arrived') stepIndex = steps.length - 1;

  const transfer =
    state.phase === 'awaitingFloor' && current && current.kind !== 'walk'
      ? { kind: current.kind, toFloor: nodes[edge + edgesInRun(route, edge)]!.floor }
      : null;

  return {
    point,
    floor: from.floor,
    nodeIndex: edge,
    stepIndex,
    progress,
    total: model.total,
    remaining: Math.max(0, model.total - progress),
    phase: state.phase,
    transfer,
  };
}

/** How many consecutive edges of the same lift/stairs kind start at `edge`. */
function edgesInRun(route: PlannedRoute, edge: number): number {
  const kind = route.edges[edge]?.kind;
  let count = 0;
  while (route.edges[edge + count]?.kind === kind) count += 1;
  return count;
}

/** Seconds left at the pace of the chosen way of getting around (walking edges only). */
export function secondsRemaining(remainingMeters: number, mobility: Mobility): number {
  return remainingMeters / SPEED_MPS[mobility];
}
