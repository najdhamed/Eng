import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from '../domain/hospital';
import { normalize, searchPlaces } from './searchPlaces';

const ids = (query: string) => searchPlaces(query, DESTINATIONS).map((place) => place.id);

describe('normalize', () => {
  it('folds common Arabic spelling variants', () => {
    expect(normalize('الصيدليّة')).toBe('صيدليه');
    expect(normalize('صيدلية')).toBe('صيدليه');
    expect(normalize('أشعة')).toBe('اشعه');
    expect(normalize('مستشفى')).toBe('مستشفي');
  });

  it('lower-cases English and drops punctuation', () => {
    expect(normalize('X-Ray!')).toBe('x ray');
  });
});

describe('searchPlaces', () => {
  it('finds a place with or without the article and the taa marbuta', () => {
    expect(ids('صيدليه')[0]).toBe('0-pharmacy');
    expect(ids('الصيدلية')[0]).toBe('0-pharmacy');
  });

  it('understands everyday words people use', () => {
    expect(ids('حمام')).toContain('0-restrooms');
    expect(ids('تحليل')).toContain('1-laboratory');
    expect(ids('اسعاف')[0]).toBe('0-emergency');
    expect(ids('coffee')[0]).toBe('0-cafeteria');
  });

  it('requires every word to match', () => {
    expect(ids('عيادة عيون')).toEqual(['2-eye']);
    expect(ids('xyz qqq')).toEqual([]);
  });

  it('returns everything for an empty query', () => {
    expect(ids('  ')).toHaveLength(DESTINATIONS.length);
  });
});
