/**
 * Step counting from the phone's accelerometer.
 *
 * Each sample is the acceleration including gravity. Gravity is tracked with a
 * slow average and subtracted; what is left is smoothed, and every isolated
 * peak above the threshold is a footfall. Three rules keep it honest:
 *  - peaks closer together than a person can walk are ignored (shaking);
 *  - a lone bump is not a step: three peaks at a walking rhythm are needed
 *    before counting starts (then those three are counted);
 *  - absurdly large peaks (a dropped phone) are ignored.
 */

export interface MotionSample {
  /** Milliseconds, any monotonic clock. */
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StepDetectorOptions {
  /** Smallest swing above gravity that counts, in m/s². */
  readonly threshold: number;
  /** Footfalls closer together than this are not steps, in ms. */
  readonly minInterval: number;
  /** A gap longer than this ends a walk, in ms. */
  readonly maxInterval: number;
  /** Peaks above this are knocks, not steps, in m/s². */
  readonly maxPeak: number;
  /** Peaks in a row needed to believe someone is walking. */
  readonly warmup: number;
}

export const DEFAULT_STEP_OPTIONS: StepDetectorOptions = {
  threshold: 1.1,
  minInterval: 280,
  maxInterval: 1600,
  maxPeak: 28,
  warmup: 3,
};

const GRAVITY_TAU_MS = 900;
const SMOOTH_TAU_MS = 70;

export class StepDetector {
  private readonly options: StepDetectorOptions;
  private gravity = 0;
  private smooth = 0;
  private lastT = 0;
  private primed = false;

  // Peak tracking.
  private above = false;
  private peak = 0;
  private peakT = 0;
  private lastPeakT = Number.NEGATIVE_INFINITY;

  // Walking rhythm.
  private streak = 0;
  private walking = false;
  private lastStepT = Number.NEGATIVE_INFINITY;

  constructor(options: Partial<StepDetectorOptions> = {}) {
    this.options = { ...DEFAULT_STEP_OPTIONS, ...options };
  }

  reset(): void {
    this.primed = false;
    this.above = false;
    this.peak = 0;
    this.lastPeakT = Number.NEGATIVE_INFINITY;
    this.streak = 0;
    this.walking = false;
    this.lastStepT = Number.NEGATIVE_INFINITY;
  }

  /** Feeds one sample. Returns how many new steps it completed (usually 0 or 1). */
  push(sample: MotionSample): number {
    const { t } = sample;
    const magnitude = Math.hypot(sample.x, sample.y, sample.z);
    if (!Number.isFinite(magnitude) || !Number.isFinite(t)) return 0;

    if (!this.primed) {
      this.primed = true;
      this.gravity = magnitude;
      this.smooth = 0;
      this.lastT = t;
      return 0;
    }
    const dt = t - this.lastT;
    if (dt <= 0) return 0;
    this.lastT = t;
    // Long gaps (the tab slept) restart the filters instead of smearing across them.
    if (dt > 1000) {
      this.gravity = magnitude;
      this.smooth = 0;
      this.above = false;
      this.streak = 0;
      this.walking = false;
      return 0;
    }

    this.gravity += (1 - Math.exp(-dt / GRAVITY_TAU_MS)) * (magnitude - this.gravity);
    const dynamic = magnitude - this.gravity;
    this.smooth += (1 - Math.exp(-dt / SMOOTH_TAU_MS)) * (dynamic - this.smooth);

    const { threshold } = this.options;
    if (!this.above) {
      if (this.smooth > threshold) {
        this.above = true;
        this.peak = this.smooth;
        this.peakT = t;
      }
      return 0;
    }

    if (this.smooth > this.peak) {
      this.peak = this.smooth;
      this.peakT = t;
      return 0;
    }
    // The peak is over once the signal has fallen well below it.
    if (this.smooth > this.peak * 0.6 && this.smooth > threshold * 0.5) return 0;

    this.above = false;
    return this.footfall(this.peakT, this.peak);
  }

  private footfall(t: number, peak: number): number {
    const { minInterval, maxInterval, maxPeak, warmup } = this.options;
    const sincePeak = t - this.lastPeakT;
    this.lastPeakT = t;

    if (peak > maxPeak) {
      this.streak = 0;
      this.walking = false;
      return 0;
    }
    // Too soon after the previous peak: shaking, not walking. Not counted, and it breaks the rhythm.
    if (sincePeak < minInterval) {
      this.streak = 0;
      this.walking = false;
      return 0;
    }
    if (sincePeak > maxInterval) {
      this.streak = 0;
      this.walking = false;
    }

    if (this.walking) {
      this.lastStepT = t;
      return 1;
    }
    this.streak += 1;
    if (this.streak < warmup) return 0;
    this.walking = true;
    this.lastStepT = t;
    return warmup;
  }

  /** True while footfalls keep arriving at a walking rhythm. */
  isWalking(now: number): boolean {
    return this.walking && now - this.lastStepT <= this.options.maxInterval;
  }
}

export type MotionPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

interface MotionEventClass {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function motionEventClass(): MotionEventClass | undefined {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window
    ? (window as unknown as { DeviceMotionEvent: MotionEventClass }).DeviceMotionEvent
    : undefined;
}

export function motionSupported(): boolean {
  return motionEventClass() !== undefined;
}

/**
 * iPhones only deliver motion after the person says yes, and only from a tap.
 * Everywhere else the sensor is simply available.
 */
export async function requestMotionPermission(): Promise<MotionPermission> {
  const motion = motionEventClass();
  if (!motion) return 'unsupported';
  if (typeof motion.requestPermission !== 'function') return 'granted';
  try {
    return (await motion.requestPermission()) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Starts listening to the accelerometer. Returns a function that stops it. */
export function watchMotion(
  onSample: (sample: MotionSample) => void,
  onNoData?: () => void,
): () => void {
  let received = false;
  const handler = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    received = true;
    onSample({ t: performance.now(), x: a.x, y: a.y, z: a.z });
  };
  window.addEventListener('devicemotion', handler);
  // A laptop "supports" the event but never sends it: tell the caller if nothing arrives.
  const timer = window.setTimeout(() => {
    if (!received) onNoData?.();
  }, 2500);
  return () => {
    window.removeEventListener('devicemotion', handler);
    window.clearTimeout(timer);
  };
}
