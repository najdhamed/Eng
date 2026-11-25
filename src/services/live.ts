import { SPEED_MPS, STRIDE_METERS } from '../config';
import type { PlannedRoute } from '../navigation/planner';
import {
  advance,
  confirmFloorChange,
  jumpToStep,
  stateAtNode,
  startState,
  view,
  type TrackerState,
  type TrackerView,
} from '../navigation/tracking';
import { GpsOdometer, watchLocation, type GpsFix, type LocationFailure } from './location';
import {
  StepDetector,
  requestMotionPermission,
  watchMotion,
  type MotionPermission,
  type MotionSample,
} from './motion';

/**
 * Follows a person along a planned route.
 *
 * Distance walked comes from whichever source is working:
 *  - steps: the accelerometer, counted at a walking rhythm (the main source indoors);
 *  - gps: the location, only while it is accurate enough (and while no steps are being counted);
 *  - demo: a simulated walker, so the feature can be shown without leaving a chair.
 * The tracker (see navigation/tracking.ts) turns that distance into a position
 * and a step. A person can always correct it: next, back, "I am on the new
 * floor", or scanning a sign.
 */

export type LiveSource = 'steps' | 'gps' | 'demo';
export type LocationState =
  | 'idle'
  | 'asking'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'unsupported';
export type MotionState = 'idle' | 'asking' | 'granted' | 'denied' | 'unsupported' | 'silent';

export interface LiveStatus {
  readonly active: boolean;
  /** What moved the person last. */
  readonly source: LiveSource | null;
  readonly location: LocationState;
  readonly motion: MotionState;
  /** Accuracy of the latest GPS fix, in metres. */
  readonly accuracy: number | null;
  /** Steps counted on this route. */
  readonly steps: number;
  /** True while footfalls are arriving at a walking rhythm. */
  readonly walking: boolean;
  /** True when nothing can measure movement, so only the buttons move the person. */
  readonly blind: boolean;
}

export interface LiveSnapshot {
  readonly status: LiveStatus;
  readonly tracker: TrackerState;
  readonly view: TrackerView;
}

export interface LiveDeps {
  requestMotion(): Promise<MotionPermission>;
  watchMotion(onSample: (s: MotionSample) => void, onNoData: () => void): () => void;
  watchLocation(onFix: (f: GpsFix) => void, onFail: (f: LocationFailure) => void): () => void;
  now(): number;
  setInterval(fn: () => void, ms: number): () => void;
}

export const DEFAULT_DEPS: LiveDeps = {
  requestMotion: requestMotionPermission,
  watchMotion,
  watchLocation,
  now: () => performance.now(),
  setInterval: (fn, ms) => {
    const id = window.setInterval(fn, ms);
    return () => window.clearInterval(id);
  },
};

/** The demo walker is faster than a person, so a whole route fits in a short pitch. */
export const DEMO_SPEEDUP = 3;
export const DEMO_TICK_MS = 200;
export const DEMO_FLOOR_PAUSE_MS = 1800;

export interface LiveOptions {
  readonly demo?: boolean;
}

export class LiveTracker {
  private route: PlannedRoute;
  private tracker: TrackerState;
  private snapshot: LiveSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly detector = new StepDetector();
  private readonly odometer = new GpsOdometer();
  private stops: Array<() => void> = [];
  private demoWaitedMs = 0;
  private status: LiveStatus = {
    active: false,
    source: null,
    location: 'idle',
    motion: 'idle',
    accuracy: null,
    steps: 0,
    walking: false,
    blind: false,
  };

  constructor(
    route: PlannedRoute,
    private readonly deps: LiveDeps = DEFAULT_DEPS,
    private wheelchair = route.mobility === 'wheelchair',
  ) {
    this.route = route;
    this.tracker = startState(route);
    this.snapshot = this.build();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => this.snapshot;

  private build(): LiveSnapshot {
    return { status: this.status, tracker: this.tracker, view: view(this.route, this.tracker) };
  }

  private commit(): void {
    this.snapshot = this.build();
    this.listeners.forEach((listener) => listener());
  }

  private patch(change: Partial<LiveStatus>): void {
    this.status = { ...this.status, ...change };
    this.commit();
  }

  /** A different route (or way of getting around): start again from its first step. */
  setRoute(route: PlannedRoute, stepIndex = 0): void {
    this.route = route;
    this.wheelchair = route.mobility === 'wheelchair';
    this.tracker = stepIndex > 0 ? jumpToStep(route, stepIndex) : startState(route);
    this.detector.reset();
    this.odometer.reset();
    this.demoWaitedMs = 0;
    this.status = { ...this.status, steps: 0, walking: false };
    this.commit();
  }

  /**
   * Starts following. Call this from a tap: it is what makes the browser ask
   * for permission to use the location and the motion sensor.
   */
  async start(options: LiveOptions = {}, stepIndex = 0): Promise<void> {
    this.stopSources();
    this.tracker = stepIndex > 0 ? jumpToStep(this.route, stepIndex) : startState(this.route);
    this.detector.reset();
    this.odometer.reset();
    this.demoWaitedMs = 0;

    if (options.demo) {
      this.status = {
        ...this.status,
        active: true,
        source: 'demo',
        steps: 0,
        walking: false,
        blind: false,
      };
      this.commit();
      this.stops.push(this.deps.setInterval(() => this.demoTick(), DEMO_TICK_MS));
      return;
    }

    this.status = {
      ...this.status,
      active: true,
      source: null,
      steps: 0,
      walking: false,
      accuracy: null,
      location: 'asking',
      motion: this.wheelchair ? 'idle' : 'asking',
      blind: false,
    };
    this.commit();

    // Both requests are made in the same tap, before any await.
    this.stops.push(
      this.deps.watchLocation(
        (fix) => this.onFix(fix),
        (failure) => this.onLocationFailure(failure),
      ),
    );
    if (!this.wheelchair) {
      const permission = await this.deps.requestMotion();
      if (!this.status.active) return;
      if (permission === 'granted') {
        this.patch({ motion: 'granted' });
        this.stops.push(
          this.deps.watchMotion(
            (sample) => this.onMotion(sample),
            () => this.onMotionSilent(),
          ),
        );
      } else {
        this.patch({ motion: permission === 'prompt' ? 'denied' : permission });
        this.refreshBlind();
      }
    }
  }

  stop(): void {
    this.stopSources();
    this.detector.reset();
    this.odometer.reset();
    this.status = {
      ...this.status,
      active: false,
      source: null,
      walking: false,
      location: 'idle',
      motion: 'idle',
      accuracy: null,
      blind: false,
    };
    this.commit();
  }

  private stopSources(): void {
    this.stops.forEach((stop) => stop());
    this.stops = [];
  }

  dispose(): void {
    this.stopSources();
    this.listeners.clear();
  }

  // --- Sensor input -----------------------------------------------------

  private stepsWorking(): boolean {
    return this.status.motion === 'granted' && !this.wheelchair;
  }

  private onMotion(sample: MotionSample): void {
    if (!this.status.active || !this.stepsWorking()) return;
    const counted = this.detector.push(sample);
    const walking = this.detector.isWalking(sample.t);
    if (counted > 0) {
      this.move(counted * STRIDE_METERS, 'steps', { steps: this.status.steps + counted, walking });
    } else if (walking !== this.status.walking) {
      this.patch({ walking });
    }
  }

  private onMotionSilent(): void {
    if (this.status.motion !== 'granted') return;
    this.patch({ motion: 'silent' });
    this.refreshBlind();
  }

  private onFix(fix: GpsFix): void {
    if (!this.status.active) return;
    const first = this.status.location !== 'granted';
    const added = this.odometer.push(fix);
    const stepsAreCounting = this.stepsWorking() && this.detector.isWalking(this.deps.now());
    if (added > 0 && !stepsAreCounting) {
      this.move(added, 'gps', { location: 'granted', accuracy: fix.accuracy });
    } else if (first || this.status.accuracy !== fix.accuracy) {
      this.patch({ location: 'granted', accuracy: fix.accuracy });
    }
    this.refreshBlind();
  }

  private onLocationFailure(failure: LocationFailure): void {
    const state: LocationState =
      failure === 'denied' ? 'denied' : failure === 'unsupported' ? 'unsupported' : 'unavailable';
    // A timeout is not a "no": keep waiting for a fix.
    if (failure === 'timeout') return;
    this.patch({ location: state, accuracy: null });
    this.refreshBlind();
  }

  /** "Blind" means no source can measure movement: only the buttons will move the person. */
  private refreshBlind(): void {
    const { location, motion, active } = this.status;
    const noLocation =
      location === 'denied' || location === 'unsupported' || location === 'unavailable';
    const noMotion =
      this.wheelchair || motion === 'denied' || motion === 'unsupported' || motion === 'silent';
    const blind = active && this.status.source !== 'demo' && noLocation && noMotion;
    if (blind !== this.status.blind) this.patch({ blind });
  }

  private move(meters: number, source: LiveSource, change: Partial<LiveStatus> = {}): void {
    this.tracker = advance(this.route, this.tracker, meters);
    this.status = { ...this.status, ...change, source };
    this.commit();
  }

  // --- The demo walker --------------------------------------------------

  private demoTick(): void {
    if (this.tracker.phase === 'arrived') return;
    if (this.tracker.phase === 'awaitingFloor') {
      this.demoWaitedMs += DEMO_TICK_MS;
      if (this.demoWaitedMs >= DEMO_FLOOR_PAUSE_MS) {
        this.demoWaitedMs = 0;
        this.confirmFloor();
      }
      return;
    }
    const pace = SPEED_MPS[this.route.mobility] * DEMO_SPEEDUP;
    this.move((pace * DEMO_TICK_MS) / 1000, 'demo', { steps: this.status.steps + 1 });
  }

  // --- Corrections ------------------------------------------------------

  /** "I am on the new floor." */
  confirmFloor(): void {
    this.tracker = confirmFloorChange(this.route, this.tracker);
    this.commit();
  }

  /** Next, back, or tapping a step. */
  goToStep(index: number): void {
    // Moving on from a lift or stairway means "I have arrived upstairs".
    const current = view(this.route, this.tracker).stepIndex;
    this.tracker =
      this.tracker.phase === 'awaitingFloor' && index === current + 1
        ? confirmFloorChange(this.route, this.tracker)
        : jumpToStep(this.route, index);
    this.commit();
  }

  /** A scanned sign or "I am here": the person is at this node of the route. */
  reanchor(nodeIndex: number): void {
    this.tracker = stateAtNode(this.route, nodeIndex);
    this.commit();
  }
}
