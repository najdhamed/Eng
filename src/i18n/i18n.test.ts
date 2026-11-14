import { describe, expect, it } from 'vitest';
import { DEFAULT_START_ID } from '../domain/hospital';
import { planRoute } from '../navigation/planner';
import { ar } from './ar';
import { describeRoute, routeIntro } from './directionsText';
import { en } from './en';
import { formatCount, roundMeters } from './plural';
import { createTranslator, translate } from './translate';

describe('messages', () => {
  it('has the same keys and placeholders in Arabic and English', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(ar[key]));
    }
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('ar', 'route.stepOf', { n: 2, total: 5 })).toBe('الخطوة 2 من 5');
    expect(translate('en', 'route.stepOf', { n: 2 })).toBe('Step 2 of {total}');
  });
});

describe('Arabic plurals', () => {
  it.each([
    [1, 'متر واحد'],
    [2, 'مترين'],
    [5, '5 أمتار'],
    [10, '10 أمتار'],
    [15, '15 متر'],
    [100, '100 متر'],
  ])('%i metres → %s', (n, expected) => {
    expect(formatCount('ar', 'meters', n)).toBe(expected);
  });

  it('counts minutes and floors the Saudi way', () => {
    expect(formatCount('ar', 'minutes', 2)).toBe('دقيقتين');
    expect(formatCount('ar', 'minutes', 3)).toBe('3 دقايق');
    expect(formatCount('ar', 'floors', 2)).toBe('دورين');
  });

  it('rounds spoken distances to 5 m', () => {
    expect(roundMeters(2)).toBe(5);
    expect(roundMeters(18.5)).toBe(20);
    expect(roundMeters(61)).toBe(60);
  });
});

describe('spoken directions', () => {
  it('leads with the turn and names the side, in Saudi Arabic', () => {
    const route = planRoute(DEFAULT_START_ID, '0-cafeteria', 'walk')!;
    const text = describeRoute(route, createTranslator('ar'));
    expect(text[0]?.title).toBe('خُش من البوابة الرئيسية');
    expect(text[1]?.title).toBe('امشِ سيدا');
    expect(text[1]?.detail).toContain('لين توصل تقاطع الممرات');
    expect(text[2]?.title).toBe('لف يسار');
    expect(text[2]?.detail).toContain('وبتلقى المقهى على يمينك');
    expect(text.at(-1)?.title).toBe('وصلت! هنا المقهى');
    expect(routeIntro(route, createTranslator('ar'))).toMatch(/^يلا نمشي للمقهى\./);
  });

  it('tells wheelchair users about the wide lift', () => {
    const route = planRoute(DEFAULT_START_ID, '2-eye', 'wheelchair')!;
    const text = describeRoute(route, createTranslator('en'));
    const lift = text.find((step) => step.icon === 'lift');
    expect(lift?.title).toBe('Take the lift up to floor 2');
    expect(lift?.detail).toContain('Lift 3 is the widest');
    expect(lift?.detail).toContain('The lifts are on your right');
  });

  it('ends every spoken step with punctuation', () => {
    const route = planRoute('4-icu', '0-emergency', 'walk')!;
    for (const step of describeRoute(route, createTranslator('ar'))) {
      expect(step.speech).toMatch(/[.!؟]$/);
    }
  });
});
