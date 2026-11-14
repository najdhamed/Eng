import { COST } from '../config';
import {
  CORRIDOR_EDGES,
  CORRIDOR_NODES,
  GROUND_ONLY_EDGES,
  NODE_LABELS,
  UNITS_PER_METER,
} from '../domain/floorPlate';
import type { FloorId, Localized, Mobility } from '../domain/types';
import { FLOORS } from '../domain/types';

export type EdgeKind = 'walk' | 'lift' | 'stairs';

export interface GraphNode {
  readonly id: string;
  readonly floor: FloorId;
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly label?: Localized;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  /** Walking distance in metres (0 for lifts and stairs). */
  readonly meters: number;
  /** Routing weight in metre-equivalents. */
  readonly cost: number;
  /** Floors climbed or descended (0 for walking edges). */
  readonly floors: number;
}

export interface Graph {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly adjacency: ReadonlyMap<string, readonly GraphEdge[]>;
}

export const nodeId = (floor: FloorId, key: string): string => `${floor}:${key}`;

export function buildGraph(): Graph {
  const nodes = new Map<string, GraphNode>();
  const adjacency = new Map<string, GraphEdge[]>();

  const addEdge = (edge: GraphEdge) => {
    const list = adjacency.get(edge.from);
    if (list) list.push(edge);
    else adjacency.set(edge.from, [edge]);
  };
  const link = (a: string, b: string, kind: EdgeKind, meters: number, cost: number, floors = 0) => {
    addEdge({ from: a, to: b, kind, meters, cost, floors });
    addEdge({ from: b, to: a, kind, meters, cost, floors });
  };
  const node = (id: string): GraphNode => {
    const found = nodes.get(id);
    if (!found) throw new Error(`Graph node missing: ${id}`);
    return found;
  };

  for (const floor of FLOORS) {
    for (const [key, point] of Object.entries(CORRIDOR_NODES)) {
      if (key === 'entrance' && floor !== 0) continue;
      const label = NODE_LABELS[key];
      const id = nodeId(floor, key);
      nodes.set(id, { id, floor, key, x: point.x, y: point.y, ...(label ? { label } : {}) });
    }
    const edges = floor === 0 ? [...CORRIDOR_EDGES, ...GROUND_ONLY_EDGES] : CORRIDOR_EDGES;
    for (const [a, b] of edges) {
      const from = node(nodeId(floor, a));
      const to = node(nodeId(floor, b));
      const meters = Math.hypot(from.x - to.x, from.y - to.y) / UNITS_PER_METER;
      link(from.id, to.id, 'walk', meters, meters);
    }
  }

  // The lift serves every floor directly; the stairs connect neighbouring floors.
  for (const [i, a] of FLOORS.entries()) {
    for (const b of FLOORS.slice(i + 1)) {
      const floors = b - a;
      link(
        nodeId(a, 'lift'),
        nodeId(b, 'lift'),
        'lift',
        0,
        COST.liftBase + COST.liftPerFloor * floors,
        floors,
      );
    }
    const next = FLOORS[i + 1];
    if (next !== undefined) {
      link(nodeId(a, 'stairs'), nodeId(next, 'stairs'), 'stairs', 0, COST.stairsPerFloor, 1);
    }
  }

  return { nodes, adjacency };
}

/** Wheelchairs and strollers never get a route over stairs. */
export function edgeAllowed(edge: GraphEdge, mobility: Mobility): boolean {
  return edge.kind !== 'stairs' || mobility === 'walk';
}

let cached: Graph | null = null;

export function getGraph(): Graph {
  cached ??= buildGraph();
  return cached;
}
