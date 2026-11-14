import type { Mobility } from '../domain/types';
import { edgeAllowed, type Graph, type GraphEdge } from './graph';
import { MinHeap } from './minHeap';

export interface ShortestPathTree {
  readonly source: string;
  readonly cost: ReadonlyMap<string, number>;
  /** The edge used to reach each node on its cheapest path. */
  readonly via: ReadonlyMap<string, GraphEdge>;
}

export function shortestPathTree(
  graph: Graph,
  source: string,
  mobility: Mobility,
): ShortestPathTree {
  const cost = new Map<string, number>([[source, 0]]);
  const via = new Map<string, GraphEdge>();
  const settled = new Set<string>();
  const queue = new MinHeap<string>();
  queue.push(source, 0);

  while (queue.size > 0) {
    const next = queue.pop();
    if (!next) break;
    const { value: current, priority } = next;
    if (settled.has(current)) continue;
    settled.add(current);

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (!edgeAllowed(edge, mobility) || settled.has(edge.to)) continue;
      const candidate = priority + edge.cost;
      if (candidate < (cost.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        cost.set(edge.to, candidate);
        via.set(edge.to, edge);
        queue.push(edge.to, candidate);
      }
    }
  }

  return { source, cost, via };
}

/** Edges from the tree's source to `target`, or null when it cannot be reached. */
export function edgesTo(tree: ShortestPathTree, target: string): GraphEdge[] | null {
  if (target === tree.source) return [];
  if (!tree.via.has(target)) return null;
  const edges: GraphEdge[] = [];
  let current = target;
  while (current !== tree.source) {
    const edge = tree.via.get(current);
    if (!edge) return null;
    edges.push(edge);
    current = edge.from;
  }
  return edges.reverse();
}
