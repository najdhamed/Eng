import { describe, expect, it } from 'vitest';
import { DEFAULT_START_ID, DESTINATIONS, PLACES } from '../domain/hospital';
import { buildGraph } from './graph';
import { nearestPlace, planRoute, travelFrom } from './planner';
import type { Step, WalkStep } from './directions';

const kinds = (steps: readonly Step[]) => steps.map((step) => step.kind);
const walks = (steps: readonly Step[]) => steps.filter((s): s is WalkStep => s.kind === 'walk');

describe('graph', () => {
  it('connects every corridor edge in both directions', () => {
    const graph = buildGraph();
    for (const [from, edges] of graph.adjacency) {
      for (const edge of edges) {
        const back = graph.adjacency
          .get(edge.to)
          ?.some((e) => e.to === from && e.kind === edge.kind);
        expect(back, `${edge.to} → ${from}`).toBe(true);
      }
    }
  });
});

describe('planRoute', () => {
  it('reaches every destination from the main entrance, for every way of getting around', () => {
    for (const mobility of ['walk', 'wheelchair', 'stroller'] as const) {
      for (const place of DESTINATIONS) {
        const route = planRoute(DEFAULT_START_ID, place.id, mobility);
        expect(route, `${mobility} → ${place.id}`).not.toBeNull();
        expect(route!.steps.at(0)?.kind).toBe('start');
        expect(route!.steps.at(-1)?.kind).toBe('arrive');
      }
    }
  });

  it('walks straight to a room on the main corridor and says which side it is on', () => {
    const route = planRoute(DEFAULT_START_ID, '0-waiting', 'walk')!;
    expect(kinds(route.steps)).toEqual(['start', 'walk', 'arrive']);
    const [walk] = walks(route.steps);
    expect(walk?.turn).toBe('straight');
    expect(walk?.arrivalSide).toBe('left');
    expect(route.steps.at(-1)).toMatchObject({ kind: 'arrive', side: 'left' });
  });

  it('turns left at the junction for the cafeteria, which is then on the right', () => {
    const route = planRoute(DEFAULT_START_ID, '0-cafeteria', 'walk')!;
    expect(walks(route.steps).map((w) => w.turn)).toEqual(['straight', 'left']);
    expect(walks(route.steps).at(-1)?.arrivalSide).toBe('right');
  });

  it('puts the prayer room straight ahead at the end of the main corridor', () => {
    const route = planRoute(DEFAULT_START_ID, '0-prayer', 'walk')!;
    expect(route.steps.at(-1)).toMatchObject({ kind: 'arrive', side: 'ahead' });
  });

  it('never sends a wheelchair or a stroller up the stairs', () => {
    for (const mobility of ['wheelchair', 'stroller'] as const) {
      for (const place of DESTINATIONS) {
        const route = planRoute(DEFAULT_START_ID, place.id, mobility)!;
        expect(route.stepFree, `${mobility} → ${place.id}`).toBe(true);
        expect(kinds(route.steps)).not.toContain('stairs');
      }
    }
  });

  it('lets a walker take the stairs for one floor and the lift for two', () => {
    expect(kinds(planRoute(DEFAULT_START_ID, '1-laboratory', 'walk')!.steps)).toContain('stairs');
    expect(kinds(planRoute(DEFAULT_START_ID, '2-dental', 'walk')!.steps)).toContain('lift');
  });

  it('folds the turn into the lift lobby into the lift step', () => {
    const route = planRoute(DEFAULT_START_ID, '2-internal', 'wheelchair')!;
    const lift = route.steps.find((step) => step.kind === 'lift');
    expect(lift).toMatchObject({ fromFloor: 0, toFloor: 2, approach: 'right' });
    // Leaving the lift facing west, the walker turns right to head north.
    expect(walks(route.steps).map((w) => w.turn)).toEqual(['straight', 'right', 'left']);
    expect(walks(route.steps).at(-1)?.arrivalSide).toBe('right');
  });

  it('routes from a room the visitor is standing in, not only from the entrance', () => {
    const route = planRoute('3-pediatrics', '0-pharmacy', 'walk')!;
    expect(route.steps[0]).toMatchObject({ kind: 'start' });
    const transfer = route.steps.find((step) => step.kind === 'lift' || step.kind === 'stairs');
    expect(transfer).toMatchObject({ fromFloor: 3, toFloor: 0 });
  });

  it('describes two places that share a doorway as straight ahead', () => {
    const route = planRoute('0-waiting', '0-restrooms', 'walk')!;
    expect(kinds(route.steps)).toEqual(['start', 'arrive']);
    expect(route.steps.at(-1)).toMatchObject({ side: 'ahead' });
  });

  it('estimates longer times for slower ways of getting around', () => {
    const walk = planRoute(DEFAULT_START_ID, '4-icu', 'walk')!.metrics.seconds;
    const wheel = planRoute(DEFAULT_START_ID, '4-icu', 'wheelchair')!.metrics.seconds;
    expect(wheel).toBeGreaterThan(walk);
  });

  it('returns null for unknown places', () => {
    expect(planRoute('nope', '0-pharmacy', 'walk')).toBeNull();
  });
});

describe('nearestPlace', () => {
  it('finds the restroom on the visitor’s own floor', () => {
    const hit = nearestPlace('2-dental', 'walk', (p) => p.amenities?.includes('restroom') ?? false);
    expect(hit?.place.id).toBe('2-restrooms');
  });

  it('measures every place from one search', () => {
    expect(travelFrom(DEFAULT_START_ID, 'wheelchair').size).toBe(PLACES.length);
  });
});
