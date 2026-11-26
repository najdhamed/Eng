import { describe, expect, it } from 'vitest';
import { PLACES } from '../domain/hospital';
import { createTranslator } from '../i18n/translate';
import { speakables } from '../i18n/speech';
import { buildCatalogue, coverage } from './catalogue';
import { normalizeSpeech, segment } from './text';

describe.each(['ar', 'en'] as const)('voice catalogue (%s)', (locale) => {
  const catalogue = buildCatalogue(locale);
  const known = new Set(catalogue.atoms.map((atom) => atom.key));

  it('can spell out every sentence the app can say', () => {
    expect(catalogue.uncovered).toEqual([]);
    const tr = createTranslator(locale);
    const missing: string[] = [];
    for (const { text } of speakables(tr)) {
      if (segment(text, known) === null) missing.push(text);
      if (missing.length > 5) break;
    }
    expect(missing).toEqual([]);
  });

  it('needs a number of recordings a person can actually make', () => {
    expect(catalogue.atoms.length).toBeGreaterThan(40);
    expect(catalogue.atoms.length).toBeLessThan(400);
  });

  it('has no duplicate or empty atoms', () => {
    expect(new Set(catalogue.atoms.map((a) => a.key)).size).toBe(catalogue.atoms.length);
    expect(new Set(catalogue.atoms.map((a) => a.id)).size).toBe(catalogue.atoms.length);
    expect(catalogue.atoms.every((a) => a.key.length > 0 && a.uses > 0)).toBe(true);
    expect(catalogue.atoms.every((a) => normalizeSpeech(a.text) === a.key)).toBe(true);
  });

  it('lists the most used phrases first', () => {
    const uses = catalogue.atoms.map((a) => a.uses);
    expect(uses).toEqual([...uses].sort((a, b) => b - a));
  });

  it('needs every place name, as a destination or a landmark', () => {
    const names = new Set(catalogue.atoms.map((a) => a.key));
    const missing = PLACES.filter((p) => !names.has(normalizeSpeech(p.name[locale])));
    // Rooms that are never a landmark and are named only in "to the X" form are covered by that form.
    for (const place of missing) {
      const to = createTranslator(locale).toPlace(place.name[locale]);
      expect(names.has(normalizeSpeech(to)), place.id).toBe(true);
    }
  });

  it('counts routes and shows each a list of atoms', () => {
    expect(catalogue.routes.length).toBe(PLACES.length * (PLACES.length - 1) * 3);
    expect(catalogue.routes.every((needs) => needs.length > 0)).toBe(true);
  });

  it('reports no coverage with nothing recorded and full coverage with everything', () => {
    expect(coverage(catalogue, new Set())).toMatchObject({ atomsDone: 0, routesFull: 0 });
    const all = coverage(catalogue, known);
    expect(all.atomsDone).toBe(all.atomsTotal);
    expect(all.routesFull).toBe(all.routesTotal);
  });

  it('shows coverage climbing as the most-used atoms are recorded', () => {
    const half = new Set(
      catalogue.atoms.slice(0, Math.ceil(catalogue.atoms.length / 2)).map((a) => a.key),
    );
    const c = coverage(catalogue, half);
    expect(c.atomsDone).toBeGreaterThan(0);
    expect(c.routesFull).toBeGreaterThanOrEqual(0);
    expect(c.routesFull).toBeLessThanOrEqual(c.routesTotal);
  });
});
