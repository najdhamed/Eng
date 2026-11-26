import { describe, expect, it } from 'vitest';
import { sanitizeJourney } from './JourneyContext';
import { sanitizePrefs } from './PrefsContext';

describe('sanitizeJourney: whatever is stored, the app can render it', () => {
  it('keeps a valid saved journey', () => {
    const saved = {
      startId: '0-entrance',
      destinationId: '0-cafeteria',
      stepIndex: 2,
      arrived: true,
      recents: ['0-cafeteria'],
    };
    expect(sanitizeJourney(saved)).toMatchObject(saved);
  });

  it.each([null, undefined, 'text', 42, true, [], [1, 2, 3], {}])('survives %j', (raw) => {
    const journey = sanitizeJourney(raw);
    expect(journey.destinationId).toBeNull();
    expect(journey.stepIndex).toBe(0);
    expect(journey.arrived).toBe(false);
    expect(journey.recents).toEqual([]);
    expect(journey.startId).toBeTruthy();
  });

  it('drops unknown places and fixes impossible step numbers', () => {
    const journey = sanitizeJourney({
      startId: 'nowhere',
      destinationId: 'nada',
      stepIndex: -4,
      arrived: 'yes',
      recents: ['0-cafeteria', 'x', 5, null],
    });
    expect(journey.destinationId).toBeNull();
    expect(journey.stepIndex).toBe(0);
    expect(journey.arrived).toBe(false);
    expect(journey.recents).toEqual(['0-cafeteria']);
    for (const bad of [Number.NaN, 1.5, Infinity, '3']) {
      expect(sanitizeJourney({ stepIndex: bad }).stepIndex).toBe(0);
    }
  });

  it('keeps at most six recent places', () => {
    const many = Array.from({ length: 12 }, () => '0-cafeteria');
    expect(sanitizeJourney({ recents: many }).recents).toHaveLength(6);
  });
});

describe('sanitizePrefs', () => {
  it.each([null, undefined, 'text', 7, [], [1], {}])('gives defaults for %j', (raw) => {
    const prefs = sanitizePrefs(raw);
    expect(['ar', 'en']).toContain(prefs.locale);
    expect(typeof prefs.voice).toBe('boolean');
  });

  it('ignores values of the wrong kind but keeps the good ones', () => {
    const prefs = sanitizePrefs({
      locale: 'en',
      textSize: { big: true },
      rate: 'ludicrous',
      voice: 'on',
      mobility: 'wheelchair',
    });
    expect(prefs.locale).toBe('en');
    expect(prefs.mobility).toBe('wheelchair');
    expect(prefs.textSize).toBe('s');
    expect(prefs.rate).toBe('normal');
  });
});
