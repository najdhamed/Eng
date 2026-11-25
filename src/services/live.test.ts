import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_START_ID } from '../domain/hospital';
import { planRoute } from '../navigation/planner';
import { pathFor } from '../navigation/tracking';
import { STRIDE_METERS } from '../config';
import { DEMO_FLOOR_PAUSE_MS, DEMO_TICK_MS, LiveTracker, type LiveDeps } from './live';
import type { GpsFix, LocationFailure } from './location';
import type { MotionPermission, MotionSample } from './motion';

interface Fakes {
  deps: LiveDeps;
  calls: string[];
  clock: { now: number };
  emitSample(s: MotionSample): void;
  emitFix(f: GpsFix): void;
  failLocation(f: LocationFailure): void;
  silentMotion(): void;
  tick(times?: number): void;
  stopped: { motion: number; location: number; timer: number };
}

function fakes(permission: MotionPermission = 'granted'): Fakes {
  const calls: string[] = [];
  const clock = { now: 0 };
  const stopped = { motion: 0, location: 0, timer: 0 };
  let onSample: (s: MotionSample) => void = () => undefined;
  let onNoData: () => void = () => undefined;
  let onFix: (f: GpsFix) => void = () => undefined;
  let onFail: (f: LocationFailure) => void = () => undefined;
  let timer: () => void = () => undefined;

  const deps: LiveDeps = {
    requestMotion: async () => {
      calls.push('requestMotion');
      return permission;
    },
    watchMotion: (a, b) => {
      calls.push('watchMotion');
      onSample = a;
      onNoData = b;
      return () => void (stopped.motion += 1);
    },
    watchLocation: (a, b) => {
      calls.push('watchLocation');
      onFix = a;
      onFail = b;
      return () => void (stopped.location += 1);
    },
    now: () => clock.now,
    setInterval: (fn) => {
      calls.push('setInterval');
      timer = fn;
      return () => void (stopped.timer += 1);
    },
  };
  return {
    deps,
    calls,
    clock,
    emitSample: (s) => {
      clock.now = s.t;
      onSample(s);
    },
    emitFix: (f) => onFix(f),
    failLocation: (f) => onFail(f),
    silentMotion: () => onNoData(),
    tick: (times = 1) => {
      for (let i = 0; i < times; i += 1) timer();
    },
    stopped,
  };
}

/** A phone in the hand of someone walking at `hz` steps a second. */
function* stride(seconds: number, hz = 1.8, start = 0): Generator<MotionSample> {
  const n = Math.round(seconds * 50);
  for (let i = 0; i < n; i += 1) {
    const t = start + i * 20;
    yield { t, x: 0.3, y: 1.2, z: 9.7 + 3 * Math.sin((2 * Math.PI * hz * (t - start)) / 1000) };
  }
}

const LAT = 24.7136;
const M = 111_195;
const gps = (t: number, north: number, accuracy = 5): GpsFix => ({
  t,
  lat: LAT + north / M,
  lng: 46.6753,
  accuracy,
});

const cafeteria = () => planRoute(DEFAULT_START_ID, '0-cafeteria', 'walk')!;
const toLift = () => planRoute(DEFAULT_START_ID, '2-internal', 'walk')!;

describe('LiveTracker: demo walk', () => {
  it('walks the whole route on its own, changing floors without being asked', () => {
    const route = toLift();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    void live.start({ demo: true });
    expect(live.getSnapshot().status).toMatchObject({ active: true, source: 'demo' });

    const floors = new Set<number>();
    let ticks = 0;
    while (live.getSnapshot().tracker.phase !== 'arrived' && ticks < 5000) {
      f.tick();
      floors.add(live.getSnapshot().view.floor);
      ticks += 1;
    }
    expect(live.getSnapshot().tracker.phase).toBe('arrived');
    expect(live.getSnapshot().view.stepIndex).toBe(route.steps.length - 1);
    expect([...floors]).toEqual(expect.arrayContaining([0, 2]));
    // A real walk of the route would take far longer than the demo does.
    expect(ticks * DEMO_TICK_MS).toBeLessThan(route.metrics.seconds * 1000);
  });

  it('pauses at the lift before carrying on, as a person would', () => {
    const route = toLift();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    void live.start({ demo: true });
    while (live.getSnapshot().tracker.phase === 'walking') f.tick();
    expect(live.getSnapshot().tracker.phase).toBe('awaitingFloor');
    f.tick(Math.floor(DEMO_FLOOR_PAUSE_MS / DEMO_TICK_MS) - 2);
    expect(live.getSnapshot().tracker.phase).toBe('awaitingFloor');
    f.tick(3);
    expect(live.getSnapshot().tracker.phase).toBe('walking');
  });

  it('does not ask for the location or the motion sensor', () => {
    const f = fakes();
    void new LiveTracker(cafeteria(), f.deps).start({ demo: true });
    expect(f.calls).toEqual(['setInterval']);
  });
});

describe('LiveTracker: counting steps', () => {
  it('asks for the location and the motion sensor together, before waiting for either', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    const started = live.start();
    // watchLocation has been called synchronously, in the same tap as requestMotion.
    expect(f.calls.slice(0, 2)).toEqual(['watchLocation', 'requestMotion']);
    expect(live.getSnapshot().status).toMatchObject({ location: 'asking', motion: 'asking' });
    await started;
    expect(live.getSnapshot().status.motion).toBe('granted');
    expect(f.calls).toContain('watchMotion');
  });

  it('turns counted steps into metres along the route', async () => {
    const route = cafeteria();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start();
    for (const s of stride(20)) f.emitSample(s);
    const { status, view } = live.getSnapshot();
    expect(status.source).toBe('steps');
    expect(status.walking).toBe(true);
    expect(status.steps).toBeGreaterThan(30);
    expect(view.progress).toBeCloseTo(status.steps * STRIDE_METERS, 5);
    expect(view.stepIndex).toBeGreaterThan(0);
  });

  it('walks a route to the end by steps alone and arrives', async () => {
    const route = cafeteria();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start();
    const seconds = Math.ceil(pathFor(route).total / (STRIDE_METERS * 1.8)) + 10;
    for (const s of stride(seconds)) f.emitSample(s);
    expect(live.getSnapshot().tracker.phase).toBe('arrived');
  });

  it('waits at the lift for the person to confirm, however many steps follow', async () => {
    const route = toLift();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start();
    for (const s of stride(120)) f.emitSample(s);
    expect(live.getSnapshot().tracker.phase).toBe('awaitingFloor');
    expect(live.getSnapshot().view.transfer?.kind).toBe('lift');
    live.confirmFloor();
    expect(live.getSnapshot().tracker.phase).toBe('walking');
    expect(live.getSnapshot().view.floor).toBe(2);
  });

  it('does not count the GPS as well while steps are being counted', async () => {
    const route = cafeteria();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start();
    for (const s of stride(10)) {
      f.emitSample(s);
      if (s.t % 1000 === 0) f.emitFix(gps(s.t, (s.t / 1000) * 1.3));
    }
    const { status, view } = live.getSnapshot();
    expect(status.source).toBe('steps');
    expect(view.progress).toBeCloseTo(status.steps * STRIDE_METERS, 5);
  });

  it('uses the GPS when the person moves but no steps are detected', async () => {
    const route = cafeteria();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start();
    for (let s = 0; s <= 30; s += 1) {
      f.clock.now = s * 1000;
      f.emitFix(gps(s * 1000, s * 1.3));
    }
    const { status, view } = live.getSnapshot();
    expect(status.source).toBe('gps');
    expect(status.location).toBe('granted');
    expect(status.accuracy).toBe(5);
    expect(view.progress).toBeGreaterThan(30);
  });
});

describe('LiveTracker: wheelchair', () => {
  it('relies on the location alone, because wheels do not make footsteps', async () => {
    const route = planRoute(DEFAULT_START_ID, '0-cafeteria', 'wheelchair')!;
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start();
    expect(f.calls).not.toContain('requestMotion');
    expect(live.getSnapshot().status.motion).toBe('idle');
    for (let s = 0; s <= 30; s += 1) f.emitFix(gps(s * 1000, s * 1.0));
    expect(live.getSnapshot().status.source).toBe('gps');
    expect(live.getSnapshot().view.progress).toBeGreaterThan(20);
  });
});

describe('LiveTracker: permissions', () => {
  it('knows when the location is refused but steps still work', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    f.failLocation('denied');
    expect(live.getSnapshot().status).toMatchObject({ location: 'denied', blind: false });
  });

  it('is blind when both the location and the motion sensor are refused', async () => {
    const f = fakes('denied');
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    expect(live.getSnapshot().status).toMatchObject({ motion: 'denied', blind: false });
    f.failLocation('denied');
    expect(live.getSnapshot().status).toMatchObject({ location: 'denied', blind: true });
  });

  it('is blind on a device with neither sensor', async () => {
    const f = fakes('unsupported');
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    f.failLocation('unsupported');
    expect(live.getSnapshot().status).toMatchObject({
      motion: 'unsupported',
      location: 'unsupported',
      blind: true,
    });
  });

  it('notices a motion sensor that never sends anything (a laptop)', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    f.silentMotion();
    expect(live.getSnapshot().status.motion).toBe('silent');
    f.failLocation('unavailable');
    expect(live.getSnapshot().status.blind).toBe(true);
  });

  it('keeps waiting after a location timeout instead of giving up', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    f.failLocation('timeout');
    expect(live.getSnapshot().status.location).toBe('asking');
  });

  it('shows the location as granted as soon as a fix arrives', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    f.emitFix(gps(0, 0, 12));
    expect(live.getSnapshot().status).toMatchObject({ location: 'granted', accuracy: 12 });
  });
});

describe('LiveTracker: corrections and lifecycle', () => {
  it('moves on a step when asked, and treats "next" at a lift as arriving upstairs', () => {
    const route = toLift();
    const live = new LiveTracker(route, fakes().deps);
    const liftIndex = route.steps.findIndex((s) => s.kind === 'lift');
    live.goToStep(liftIndex);
    expect(live.getSnapshot().tracker.phase).toBe('awaitingFloor');
    live.goToStep(liftIndex + 1);
    expect(live.getSnapshot().view.floor).toBe(2);
    expect(live.getSnapshot().view.stepIndex).toBe(liftIndex + 1);
    live.goToStep(0);
    expect(live.getSnapshot().view.floor).toBe(0);
  });

  it('puts the person at a scanned sign', () => {
    const route = toLift();
    const live = new LiveTracker(route, fakes().deps);
    live.reanchor(route.nodes.length - 1);
    expect(live.getSnapshot().tracker.phase).toBe('arrived');
  });

  it('starts from a given step, so live guidance can pick up where the person is', async () => {
    const route = toLift();
    const f = fakes();
    const live = new LiveTracker(route, f.deps);
    await live.start({ demo: true }, 2);
    expect(live.getSnapshot().view.stepIndex).toBe(2);
  });

  it('stops every sensor and the timer, and forgets the signal state', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    f.emitFix(gps(0, 0));
    live.stop();
    expect(f.stopped).toMatchObject({ motion: 1, location: 1 });
    expect(live.getSnapshot().status).toMatchObject({
      active: false,
      location: 'idle',
      motion: 'idle',
      source: null,
    });

    void live.start({ demo: true });
    live.stop();
    expect(f.stopped.timer).toBe(1);
  });

  it('ignores sensor input after it has been stopped', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    live.stop();
    for (const s of stride(10)) f.emitSample(s);
    expect(live.getSnapshot().view.progress).toBe(0);
  });

  it('does not start the motion sensor if stopped while the prompt was open', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    const started = live.start();
    live.stop();
    await started;
    expect(f.calls).not.toContain('watchMotion');
  });

  it('starts over on a new route', async () => {
    const f = fakes();
    const live = new LiveTracker(cafeteria(), f.deps);
    await live.start();
    for (const s of stride(8)) f.emitSample(s);
    expect(live.getSnapshot().view.progress).toBeGreaterThan(0);
    live.setRoute(toLift());
    expect(live.getSnapshot().view.progress).toBe(0);
    expect(live.getSnapshot().status.steps).toBe(0);
  });

  it('tells subscribers about every change, and only while they listen', () => {
    const live = new LiveTracker(toLift(), fakes().deps);
    const listener = vi.fn();
    const unsubscribe = live.subscribe(listener);
    live.goToStep(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    live.goToStep(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns the same snapshot until something changes', () => {
    const live = new LiveTracker(toLift(), fakes().deps);
    expect(live.getSnapshot()).toBe(live.getSnapshot());
    const before = live.getSnapshot();
    live.goToStep(1);
    expect(live.getSnapshot()).not.toBe(before);
  });
});
