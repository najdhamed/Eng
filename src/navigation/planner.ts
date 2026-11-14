import {
  LIFT_SECONDS_PER_FLOOR,
  LIFT_WAIT_SECONDS,
  SPEED_MPS,
  STAIRS_SECONDS_PER_FLOOR,
} from '../config';
import { findPlace, PLACES } from '../domain/hospital';
import type { FloorId, Mobility, Place } from '../domain/types';
import { edgesTo, shortestPathTree } from './dijkstra';
import { buildSteps, type Step } from './directions';
import { getGraph, nodeId, type GraphEdge, type GraphNode } from './graph';

export interface RouteMetrics {
  readonly meters: number;
  readonly seconds: number;
  readonly lifts: number;
  readonly stairsFloors: number;
  /** Floors the route passes through, in order. */
  readonly floors: readonly FloorId[];
}

export interface PlannedRoute {
  readonly start: Place;
  readonly destination: Place;
  readonly mobility: Mobility;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly steps: readonly Step[];
  readonly metrics: RouteMetrics;
  /** True when nothing on the route needs stairs. */
  readonly stepFree: boolean;
}

export const placeNodeId = (place: Place): string => nodeId(place.floor, place.node);

export function measure(
  edges: readonly GraphEdge[],
  startFloor: FloorId,
  mobility: Mobility,
): RouteMetrics {
  let meters = 0;
  let lifts = 0;
  let stairsFloors = 0;
  let liftFloors = 0;
  const floors: FloorId[] = [startFloor];
  const graph = getGraph();

  for (const edge of edges) {
    if (edge.kind === 'walk') meters += edge.meters;
    else if (edge.kind === 'lift') {
      lifts += 1;
      liftFloors += edge.floors;
    } else stairsFloors += edge.floors;
    const floor = graph.nodes.get(edge.to)?.floor;
    if (floor !== undefined && floors[floors.length - 1] !== floor) floors.push(floor);
  }

  const seconds =
    meters / SPEED_MPS[mobility] +
    lifts * LIFT_WAIT_SECONDS +
    liftFloors * LIFT_SECONDS_PER_FLOOR +
    stairsFloors * STAIRS_SECONDS_PER_FLOOR;

  return { meters, seconds, lifts, stairsFloors, floors };
}

export function planRoute(
  startId: string,
  destinationId: string,
  mobility: Mobility,
): PlannedRoute | null {
  const start = findPlace(startId);
  const destination = findPlace(destinationId);
  if (!start || !destination) return null;

  const graph = getGraph();
  const source = placeNodeId(start);
  const tree = shortestPathTree(graph, source, mobility);
  const edges = edgesTo(tree, placeNodeId(destination));
  if (!edges) return null;

  const nodes = [graph.nodes.get(source)!, ...edges.map((edge) => graph.nodes.get(edge.to)!)];
  return {
    start,
    destination,
    mobility,
    nodes,
    edges,
    steps: buildSteps(start, destination, nodes, edges),
    metrics: measure(edges, start.floor, mobility),
    stepFree: edges.every((edge) => edge.kind !== 'stairs'),
  };
}

/** Travel metrics from one place to every reachable place, from a single search. */
export function travelFrom(startId: string, mobility: Mobility): Map<string, RouteMetrics> {
  const start = findPlace(startId);
  const result = new Map<string, RouteMetrics>();
  if (!start) return result;

  const tree = shortestPathTree(getGraph(), placeNodeId(start), mobility);
  for (const place of PLACES) {
    const edges = edgesTo(tree, placeNodeId(place));
    if (edges) result.set(place.id, measure(edges, start.floor, mobility));
  }
  return result;
}

/** The quickest place to reach that matches `predicate`, e.g. the nearest restroom. */
export function nearestPlace(
  startId: string,
  mobility: Mobility,
  predicate: (place: Place) => boolean,
): { place: Place; metrics: RouteMetrics } | null {
  const travel = travelFrom(startId, mobility);
  let best: { place: Place; metrics: RouteMetrics } | null = null;
  for (const place of PLACES) {
    if (place.id === startId || !predicate(place)) continue;
    const metrics = travel.get(place.id);
    if (metrics && (!best || metrics.seconds < best.metrics.seconds)) best = { place, metrics };
  }
  return best;
}
