import { describe, expect, it } from 'vitest';
import { SPEED_MPS } from '../config';
import { DEFAULT_START_ID, PLACES } from '../domain/hospital';
import { planRoute, type PlannedRoute } from './planner';
import {
  ARRIVE_LEAD_METERS,
  advance,
  confirmFloorChange,
  jumpToStep,
  pathFor,
  secondsRemaining,
  startState,
  stateAtNode,
  view,
  type TrackerState,
} from './tracking';

const route = (from: string, to: string, mobility: 'walk' | 'wheelchair' | 'stroller' = 'walk') =>
  planRoute(from, to, mobility)!;

interface Walk {
  readonly steps: readonly number[];
  readonly floors: readonly number[];
  readonly progress: readonly number[];
  readonly confirmations: number;
  readonly final: TrackerState;
  readonly ticks: number;
}

/** Walks a whole route in fixed strides, confirming floor changes the way a person would. */
function walkAll(r: PlannedRoute, stride: number): Walk {
  let state = startState(r);
  const steps: number[] = [];
  const floors: number[] = [];
  const progress: number[] = [];
  let confirmations = 0;
  let ticks = 0;
  const limit = Math.ceil(pathFor(r).total / stride) + 4 * r.edges.length + 10;

  const record = () => {
    const v = view(r, state);
    steps.push(v.stepIndex);
    floors.push(v.floor);
    progress.push(v.progress);
  };
  record();
  while (state.phase !== 'arrived' && ticks < limit) {
    ticks += 1;
    if (state.phase === 'awaitingFloor') {
      state = confirmFloorChange(r, state);
      confirmations += 1;
    } else {
      state = advance(r, state, stride);
    }
    record();
  }
  return { steps, floors, progress, confirmations, final: state, ticks };
}

describe('tracking: the path model', () => {
  it('measures the same distance as the planner does, on every route', () => {
    for (const from of PLACES) {
      for (const to of PLACES) {
        if (from.id === to.id) continue;
        const r = route(from.id, to.id);
        expect(pathFor(r).total, `${from.id} → ${to.id}`).toBeCloseTo(r.metrics.meters, 6);
      }
    }
  });

  it('caches the model per route', () => {
    const r = route(DEFAULT_START_ID, '0-cafeteria');
    expect(pathFor(r)).toBe(pathFor(r));
  });
});

describe('tracking: a walk to the cafeteria', () => {
  const r = route(DEFAULT_START_ID, '0-cafeteria');

  it('starts on the first step, at the entrance, not yet walking', () => {
    const v = view(r, startState(r));
    expect(v.stepIndex).toBe(0);
    expect(v.progress).toBe(0);
    expect(v.floor).toBe(0);
    expect(v.point).toEqual({ x: r.nodes[0]!.x, y: r.nodes[0]!.y });
    expect(v.remaining).toBeCloseTo(r.metrics.meters, 6);
  });

  it('keeps showing "start" until the person has really set off', () => {
    const s0 = startState(r);
    expect(view(r, advance(r, s0, 1)).stepIndex).toBe(0);
    expect(view(r, advance(r, s0, 2)).stepIndex).toBe(1);
  });

  it('moves the dot along the corridor as metres are walked', () => {
    const a = view(r, advance(r, startState(r), 3));
    const b = view(r, advance(r, startState(r), 9));
    expect(a.progress).toBeCloseTo(3, 6);
    expect(b.progress).toBeCloseTo(9, 6);
    // The entrance leads north along one corridor, so the dot only changes y.
    expect(b.point.y).toBeLessThan(a.point.y);
    expect(b.point.x).toBeCloseTo(a.point.x, 6);
  });

  it('announces the turn a few metres before the junction', () => {
    const junction = pathFor(r).cumulative[r.steps[2]!.pathIndex]!;
    const early = view(r, advance(r, startState(r), junction - 8));
    const near = view(r, advance(r, startState(r), junction - 3));
    expect(early.stepIndex).toBe(1);
    expect(near.stepIndex).toBe(2);
  });

  it('arrives at the end, and keeps the final step', () => {
    const s = advance(r, startState(r), 1000);
    const v = view(r, s);
    expect(s.phase).toBe('arrived');
    expect(v.stepIndex).toBe(r.steps.length - 1);
    expect(v.remaining).toBe(0);
    expect(advance(r, s, 10)).toBe(s);
  });

  it('counts as arrived within a couple of metres of the end', () => {
    const near = advance(r, startState(r), pathFor(r).total - 1);
    expect(near.phase).toBe('arrived');
    const far = advance(r, startState(r), pathFor(r).total - 5);
    expect(far.phase).toBe('walking');
    expect(view(r, far).stepIndex).toBe(r.steps.length - 1);
  });

  it('ignores zero, negative and non-numeric distances', () => {
    const s = startState(r);
    expect(advance(r, s, 0)).toBe(s);
    expect(advance(r, s, -5)).toBe(s);
    expect(advance(r, s, Number.NaN)).toBe(s);
  });
});

describe('tracking: changing floors', () => {
  const r = route(DEFAULT_START_ID, '2-internal', 'wheelchair');
  const liftStep = r.steps.findIndex((s) => s.kind === 'lift');

  it('stops at the lift and waits, however far the person is reported to have walked', () => {
    const s = advance(r, startState(r), 500);
    const v = view(r, s);
    expect(s.phase).toBe('awaitingFloor');
    expect(v.stepIndex).toBe(liftStep);
    expect(v.floor).toBe(0);
    expect(v.transfer).toEqual({ kind: 'lift', toFloor: 2 });
    expect(v.remaining).toBeGreaterThan(0);
    // Walking further does nothing until the floor change is confirmed.
    expect(advance(r, s, 20)).toBe(s);
  });

  it('carries on from the lift exit on the new floor once confirmed', () => {
    const waiting = advance(r, startState(r), 500);
    const after = confirmFloorChange(r, waiting);
    const v = view(r, after);
    expect(after.phase).toBe('walking');
    expect(v.floor).toBe(2);
    expect(v.transfer).toBeNull();
    expect(v.stepIndex).toBe(liftStep + 1);
    expect(r.steps[v.stepIndex]!.floor).toBe(2);
  });

  it('does nothing when asked to confirm a floor change that is not happening', () => {
    const s = startState(r);
    expect(confirmFloorChange(r, s)).toBe(s);
  });

  it('shows the stairs transfer for a walker going up one floor', () => {
    const stairs = route(DEFAULT_START_ID, '1-laboratory');
    const s = advance(stairs, startState(stairs), 500);
    expect(view(stairs, s).transfer).toEqual({ kind: 'stairs', toFloor: 1 });
  });
});

describe('tracking: manual correction', () => {
  const r = route(DEFAULT_START_ID, '2-internal', 'wheelchair');

  it('puts the person at the start of any step', () => {
    r.steps.forEach((step, i) => {
      const v = view(r, jumpToStep(r, i));
      expect(v.stepIndex, `step ${i}`).toBe(i);
      expect(v.floor, `step ${i}`).toBe(step.floor);
    });
  });

  it('clamps out-of-range steps', () => {
    expect(view(r, jumpToStep(r, -3)).stepIndex).toBe(0);
    expect(view(r, jumpToStep(r, 99)).stepIndex).toBe(r.steps.length - 1);
    expect(jumpToStep(r, 99).phase).toBe('arrived');
  });

  it('lets a person go back a step after walking on', () => {
    const ahead = advance(r, startState(r), 30);
    expect(view(r, ahead).stepIndex).toBeGreaterThan(0);
    expect(view(r, jumpToStep(r, 0)).stepIndex).toBe(0);
  });

  it('puts someone who jumps to the lift step at the lift, waiting', () => {
    const lift = r.steps.findIndex((s) => s.kind === 'lift');
    expect(jumpToStep(r, lift).phase).toBe('awaitingFloor');
  });
});

describe('tracking: standing at a node (a scanned sign)', () => {
  const r = route(DEFAULT_START_ID, '2-internal', 'wheelchair');

  it('puts the person on every node of the route, on the right floor and step', () => {
    r.nodes.forEach((node, i) => {
      const v = view(r, stateAtNode(r, i));
      expect(v.floor, `node ${i}`).toBe(node.floor);
      expect(r.steps[v.stepIndex]!.floor, `node ${i}`).toBe(node.floor);
      expect(v.point, `node ${i}`).toEqual({ x: node.x, y: node.y });
    });
  });

  it('treats the lift lobby as waiting, and the lift exit as already upstairs', () => {
    const lobby = r.edges.findIndex((e) => e.kind === 'lift');
    expect(stateAtNode(r, lobby).phase).toBe('awaitingFloor');
    const upstairs = stateAtNode(r, lobby + 1);
    expect(upstairs.phase).toBe('walking');
    expect(view(r, upstairs).stepIndex).toBe(r.steps.findIndex((s) => s.kind === 'lift') + 1);
  });

  it('ends at the last node and clamps nonsense', () => {
    expect(stateAtNode(r, r.nodes.length - 1).phase).toBe('arrived');
    expect(stateAtNode(r, 999).phase).toBe('arrived');
    expect(stateAtNode(r, -4).edge).toBe(0);
  });

  it('agrees with walking there, for every node of every route', () => {
    const problems: string[] = [];
    for (const from of PLACES) {
      for (const to of PLACES) {
        if (from.id === to.id) continue;
        const route2 = route(from.id, to.id);
        route2.nodes.forEach((node, i) => {
          const state = stateAtNode(route2, i);
          const v = view(route2, state);
          // Nodes halfway up a two-floor stairway are moved to the top of the flight.
          const landing = route2.nodes[state.edge]!;
          if (v.floor !== landing.floor) problems.push(`${from.id} → ${to.id} node ${i}: floor`);
          if (route2.steps[v.stepIndex]!.floor !== landing.floor)
            problems.push(`${from.id} → ${to.id} node ${i}: step floor`);
          if (state.edge !== i && node.floor === landing.floor)
            problems.push(`${from.id} → ${to.id} node ${i}: moved`);
        });
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});

describe('tracking: time left', () => {
  it('uses the pace of the chosen way of getting around', () => {
    expect(secondsRemaining(110, 'walk')).toBeCloseTo(110 / SPEED_MPS.walk, 6);
    expect(secondsRemaining(80, 'wheelchair')).toBeCloseTo(100, 6);
    expect(secondsRemaining(0, 'stroller')).toBe(0);
  });
});

describe('tracking: every route in the demo hospital, walked end to end', () => {
  it('shows every step in order, never goes backwards and always arrives', () => {
    // Millions of ticks: collect problems and assert once, instead of one expect per tick.
    const problems: string[] = [];
    let routes = 0;
    for (const mobility of ['walk', 'wheelchair', 'stroller'] as const) {
      for (const from of PLACES) {
        for (const to of PLACES) {
          if (from.id === to.id) continue;
          const r = route(from.id, to.id, mobility);
          const label = `${mobility}: ${from.id} → ${to.id}`;
          const slow = walkAll(r, 0.7);

          for (const w of [slow, walkAll(r, 2.5)]) {
            if (w.final.phase !== 'arrived') problems.push(`${label}: never arrived`);
            if (w.steps.at(-1) !== r.steps.length - 1)
              problems.push(`${label}: last step not shown`);
            for (let i = 1; i < w.steps.length; i += 1) {
              if (w.steps[i]! < w.steps[i - 1]!) problems.push(`${label}: step went back at ${i}`);
              if (w.progress[i]! < w.progress[i - 1]! - 1e-9)
                problems.push(`${label}: progress went back at ${i}`);
            }
          }

          // At a walking stride no step is skipped, and each one is on the floor the dot is on.
          // The "start" step is skipped only when there is nothing to walk before the first lift
          // or stairway, and a doorway shared by both places leaves only "you are there".
          const first = r.edges[0];
          const expected =
            r.edges.length === 0
              ? [r.steps.length - 1]
              : first!.kind !== 'walk'
                ? r.steps.map((_, i) => i).slice(1)
                : r.steps.map((_, i) => i);
          const shown = [...new Set(slow.steps)];
          if (shown.join() !== expected.join())
            problems.push(`${label}: shows steps ${shown.join()}`);
          slow.steps.forEach((stepIndex, i) => {
            if (r.steps[stepIndex]!.floor !== slow.floors[i])
              problems.push(`${label}: wrong floor at ${i}`);
          });
          routes += 1;
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(routes).toBe(PLACES.length * (PLACES.length - 1) * 3);
  });

  it('asks for exactly one confirmation per lift ride or stairway', () => {
    for (const from of PLACES) {
      for (const to of PLACES) {
        if (from.id === to.id) continue;
        const r = route(from.id, to.id);
        const transfers = r.steps.filter((s) => s.kind === 'lift' || s.kind === 'stairs').length;
        expect(walkAll(r, 0.7).confirmations, `${from.id} → ${to.id}`).toBe(transfers);
      }
    }
  });

  it('shows the arrival step before the end, by at most the arrival lead', () => {
    const r = route(DEFAULT_START_ID, '0-prayer');
    const total = pathFor(r).total;
    const just = view(r, advance(r, startState(r), total - ARRIVE_LEAD_METERS - 0.5));
    const inside = view(r, advance(r, startState(r), total - ARRIVE_LEAD_METERS + 0.5));
    expect(just.stepIndex).toBeLessThan(r.steps.length - 1);
    expect(inside.stepIndex).toBe(r.steps.length - 1);
  });
});
