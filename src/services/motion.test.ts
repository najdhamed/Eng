import { describe, expect, it } from 'vitest';
import { StepDetector, type MotionSample } from './motion';

/** A phone in a pocket or hand while walking: gravity plus a swing at the step rate. */
function walk(opts: {
  hz: number;
  amp: number;
  seconds: number;
  rate?: number;
  noise?: number;
  start?: number;
}) {
  const rate = opts.rate ?? 50;
  const n = Math.round(opts.seconds * rate);
  const start = opts.start ?? 0;
  const out: MotionSample[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let i = 0; i < n; i += 1) {
    const t = start + (i * 1000) / rate;
    const swing = opts.amp * Math.sin((2 * Math.PI * opts.hz * (t - start)) / 1000);
    const noise = (opts.noise ?? 0) * rand();
    out.push({ t, x: 0.3 + noise, y: 1.2 + noise, z: 9.7 + swing + noise });
  }
  return out;
}

const count = (samples: MotionSample[], detector = new StepDetector()) =>
  samples.reduce((sum, s) => sum + detector.push(s), 0);

describe('StepDetector', () => {
  it('counts a steady walk to within a couple of steps', () => {
    for (const hz of [1.5, 1.8, 2.1]) {
      const expected = hz * 20;
      const got = count(walk({ hz, amp: 3, seconds: 20 }));
      expect(Math.abs(got - expected), `${hz} Hz`).toBeLessThanOrEqual(3);
    }
  });

  it('still counts a gentle walk (a phone held steady in the hand)', () => {
    const got = count(walk({ hz: 1.8, amp: 1.8, seconds: 20, noise: 0.2 }));
    expect(Math.abs(got - 36)).toBeLessThanOrEqual(4);
  });

  it('counts at a low sample rate, as some phones deliver', () => {
    const got = count(walk({ hz: 1.8, amp: 3, seconds: 20, rate: 20 }));
    expect(Math.abs(got - 36)).toBeLessThanOrEqual(5);
  });

  it('counts nothing for a phone lying still or sensor noise', () => {
    expect(count(walk({ hz: 0, amp: 0, seconds: 30 }))).toBe(0);
    expect(count(walk({ hz: 0, amp: 0, seconds: 30, noise: 0.3 }))).toBe(0);
  });

  it('does not count one bump, or two, as walking', () => {
    const bumps = walk({ hz: 1.8, amp: 3, seconds: 1.0 }); // about two swings
    expect(count(bumps)).toBe(0);
  });

  it('does not count shaking the phone, which is faster than anyone walks', () => {
    expect(count(walk({ hz: 6, amp: 6, seconds: 20, rate: 100 }))).toBe(0);
  });

  it('ignores knocks far larger than a footfall, even at a walking rhythm', () => {
    const knocks = walk({ hz: 0, amp: 0, seconds: 20 }).map((s) => {
      const phase = (s.t % 555) / 555;
      return phase < 0.18 ? { ...s, z: s.z + 70 } : s;
    });
    expect(count(knocks)).toBe(0);
  });

  it('stops counting when the person stops, and starts again when they walk on', () => {
    const detector = new StepDetector();
    const first = walk({ hz: 1.8, amp: 3, seconds: 10 });
    const rest = walk({ hz: 0, amp: 0, seconds: 8, start: 10_000 });
    const second = walk({ hz: 1.8, amp: 3, seconds: 10, start: 18_000 });
    const a = count(first, detector);
    const b = count(rest, detector);
    const c = count(second, detector);
    expect(a).toBeGreaterThan(14);
    expect(b).toBe(0);
    expect(c).toBeGreaterThan(14);
  });

  it('survives a long gap (a tab that slept) without a burst of steps', () => {
    const detector = new StepDetector();
    count(walk({ hz: 1.8, amp: 3, seconds: 5 }), detector);
    const burst = count(walk({ hz: 0, amp: 0, seconds: 2, start: 60_000 }), detector);
    expect(burst).toBe(0);
  });

  it('ignores garbage samples', () => {
    const detector = new StepDetector();
    expect(detector.push({ t: Number.NaN, x: 0, y: 0, z: 9.8 })).toBe(0);
    expect(detector.push({ t: 1, x: Number.NaN, y: 0, z: 9.8 })).toBe(0);
  });

  it('reports whether the person is walking right now', () => {
    const detector = new StepDetector();
    const samples = walk({ hz: 1.8, amp: 3, seconds: 8 });
    count(samples, detector);
    expect(detector.isWalking(8000)).toBe(true);
    expect(detector.isWalking(12_000)).toBe(false);
    detector.reset();
    expect(detector.isWalking(8000)).toBe(false);
  });
});
