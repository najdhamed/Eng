import { describe, expect, it } from 'vitest';
import { GpsOdometer, haversine, type GpsFix } from './location';

const LAT = 24.7136;
const LNG = 46.6753;
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);

const fix = (t: number, north: number, east: number, accuracy = 6): GpsFix => ({
  t,
  lat: LAT + north / M_PER_DEG_LAT,
  lng: LNG + east / M_PER_DEG_LNG,
  accuracy,
});

describe('haversine', () => {
  it('measures short distances to the centimetre', () => {
    expect(haversine(fix(0, 0, 0), fix(0, 10, 0))).toBeCloseTo(10, 1);
    expect(haversine(fix(0, 0, 0), fix(0, 0, 25))).toBeCloseTo(25, 1);
    expect(haversine(fix(0, 0, 0), fix(0, 3, 4))).toBeCloseTo(5, 1);
  });

  it('is zero for the same point', () => {
    expect(haversine(fix(0, 0, 0), fix(0, 0, 0))).toBe(0);
  });
});

describe('GpsOdometer', () => {
  it('adds up a steady walk', () => {
    const odo = new GpsOdometer();
    for (let s = 0; s <= 60; s += 1) odo.push(fix(s * 1000, s * 1.2, 0));
    expect(odo.meters).toBeGreaterThan(68);
    expect(odo.meters).toBeLessThanOrEqual(72.1);
  });

  it('follows a corner, not just the straight line between the ends', () => {
    const odo = new GpsOdometer();
    for (let s = 0; s <= 20; s += 1) odo.push(fix(s * 1000, s * 1.2, 0));
    for (let s = 1; s <= 20; s += 1) odo.push(fix((20 + s) * 1000, 24, s * 1.2));
    expect(odo.meters).toBeGreaterThan(44);
    expect(odo.meters).toBeLessThan(49);
  });

  it('does not creep while someone stands still and the fix wobbles', () => {
    const odo = new GpsOdometer();
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    for (let s = 0; s < 300; s += 1) odo.push(fix(s * 1000, rand() * 3, rand() * 3, 8));
    expect(odo.meters).toBeLessThan(5);
  });

  it('ignores fixes too inaccurate to place someone in a corridor', () => {
    const odo = new GpsOdometer();
    for (let s = 0; s <= 60; s += 1) odo.push(fix(s * 1000, s * 1.2, 0, 45));
    expect(odo.meters).toBe(0);
  });

  it('does not count a jump as walking, but carries on from the new spot', () => {
    const odo = new GpsOdometer();
    odo.push(fix(0, 0, 0));
    odo.push(fix(1000, 300, 0)); // a 300 m leap in one second
    expect(odo.meters).toBe(0);
    odo.push(fix(2000, 301.5, 0));
    odo.push(fix(3000, 303, 0));
    odo.push(fix(4000, 304.5, 0));
    expect(odo.meters).toBeGreaterThan(2);
    expect(odo.meters).toBeLessThan(5);
  });

  it('ignores out-of-order and malformed fixes', () => {
    const odo = new GpsOdometer();
    odo.push(fix(5000, 0, 0));
    expect(odo.push(fix(4000, 10, 0))).toBe(0);
    expect(odo.push({ t: 6000, lat: Number.NaN, lng: 0, accuracy: 5 })).toBe(0);
    expect(odo.meters).toBe(0);
  });

  it('starts over when reset', () => {
    const odo = new GpsOdometer();
    odo.push(fix(0, 0, 0));
    odo.push(fix(3000, 6, 0));
    expect(odo.meters).toBeGreaterThan(5);
    odo.reset();
    expect(odo.meters).toBe(0);
    expect(odo.push(fix(9000, 100, 0))).toBe(0);
  });
});
