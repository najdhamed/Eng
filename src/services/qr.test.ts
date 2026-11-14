import { describe, expect, it } from 'vitest';
import { encodePlaceCode, parsePlaceCode } from './qr';

describe('QR place codes', () => {
  it('round-trips a place id', () => {
    expect(parsePlaceCode(encodePlaceCode('2-dental'))).toBe('2-dental');
  });

  it('accepts a deep link to a place', () => {
    expect(parsePlaceCode('https://example.org/darbak/#here-1-laboratory')).toBe('1-laboratory');
  });

  it('ignores codes that are not Darbak signs', () => {
    expect(parsePlaceCode('https://example.org')).toBeNull();
    expect(parsePlaceCode('darbak:')).toBeNull();
    expect(parsePlaceCode(null)).toBeNull();
  });
});
