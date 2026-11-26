import type { Locale } from '../domain/types';
import { speakables } from '../i18n/speech';
import { createTranslator, translate, type MessageKey, type Translator } from '../i18n/translate';
import { atomId, normalizeSpeech, segment } from './text';

/**
 * The list of phrases a voice pack needs, worked out from the app itself.
 *
 * The app's own translator is wrapped so that every message template it uses
 * (cut at the {placeholders}) and every value it fills in (a distance, a place
 * name, a floor) is noted. Together these are the atoms: record each once and
 * every sentence the app can say can be rebuilt from them.
 */

export type AtomGroup = 'phrase' | 'number' | 'place' | 'floor';

export interface Atom {
  readonly key: string;
  readonly id: string;
  /** How it should be read, as written in the app (with its vowel marks). */
  readonly text: string;
  readonly group: AtomGroup;
  /** In how many different sentences it appears. */
  readonly uses: number;
  /** A sentence that contains it, to show a speaker the tone to take. */
  readonly example: string;
}

export interface Catalogue {
  readonly locale: Locale;
  readonly atoms: readonly Atom[];
  readonly sentences: number;
  /** Per route, the indexes into `atoms` that it needs. */
  readonly routes: readonly (readonly number[])[];
  /** Per sentence outside the routes (arrival, floors, tests…), the same. */
  readonly extras: readonly (readonly number[])[];
  /** Sentences the atoms cannot spell out: always empty unless the app and catalogue disagree. */
  readonly uncovered: readonly string[];
}

const EDGE_PUNCTUATION = /^[\s.,،؛;:!?؟"'“”«»()\-–—]+|[\s.,،؛;:!?؟"'“”«»()\-–—]+$/g;

interface Found {
  text: string;
  group: AtomGroup;
}

function recordingTranslator(locale: Locale, found: Map<string, Found>): Translator {
  const base = createTranslator(locale);
  const note = (text: string, group: AtomGroup) => {
    const trimmed = text.replace(EDGE_PUNCTUATION, '');
    const key = normalizeSpeech(trimmed);
    if (key && !found.has(key)) found.set(key, { text: trimmed, group });
    return text;
  };
  const tag =
    <A extends unknown[]>(group: AtomGroup, fn: (...args: A) => string) =>
    (...args: A) =>
      note(fn(...args), group);

  return {
    ...base,
    t: (key: MessageKey, vars) => {
      // The message itself, cut at its placeholders, then the values filled in.
      for (const piece of translate(locale, key).split(/\{\w+\}/)) note(piece, 'phrase');
      const result = base.t(key, vars);
      if (vars) {
        for (const value of Object.values(vars)) {
          const text = String(value);
          // Values arrive already tagged by the helper that made them; this only catches strays.
          if (!found.has(normalizeSpeech(text))) note(text, /\d/.test(text) ? 'number' : 'phrase');
        }
      }
      return result;
    },
    count: tag('number', base.count),
    distance: tag('number', base.distance),
    duration: tag('number', base.duration),
    name: tag('place', base.name),
    toPlace: tag('place', base.toPlace),
    floorName: tag('floor', base.floorName),
    floorTo: tag('floor', base.floorTo),
    floorShort: tag('floor', base.floorShort),
  };
}

const built = new Map<Locale, Catalogue>();

/** The catalogue is derived from every route, which takes a moment: it is built once per language. */
export function buildCatalogue(locale: Locale): Catalogue {
  let catalogue = built.get(locale);
  if (!catalogue) {
    catalogue = buildCatalogueNow(locale);
    built.set(locale, catalogue);
  }
  return catalogue;
}

function buildCatalogueNow(locale: Locale): Catalogue {
  const found = new Map<string, Found>();
  const sentences: { text: string; route: number }[] = [];
  for (const spoken of speakables(recordingTranslator(locale, found))) sentences.push(spoken);

  const known = new Set(found.keys());
  const keys = [...known];
  const uses = new Map<string, number>();
  const example = new Map<string, string>();
  const index = new Map(keys.map((key, i) => [key, i]));
  const uncovered: string[] = [];
  const perSentence = new Map<string, readonly string[] | null>();

  const routeNeeds = new Map<number, Set<number>>();
  const extras: number[][] = [];

  for (const { text, route } of sentences) {
    let cover = perSentence.get(text);
    if (cover === undefined) {
      cover = segment(text, known);
      perSentence.set(text, cover);
      if (cover) {
        for (const key of new Set(cover)) {
          uses.set(key, (uses.get(key) ?? 0) + 1);
          if (!example.has(key)) example.set(key, text);
        }
      } else uncovered.push(text);
    }
    if (!cover) continue;
    const needed = cover.map((key) => index.get(key)!);
    if (route < 0) extras.push(needed);
    else {
      const set = routeNeeds.get(route) ?? new Set<number>();
      needed.forEach((i) => set.add(i));
      routeNeeds.set(route, set);
    }
  }

  const atoms: Atom[] = keys
    .map((key) => ({
      key,
      id: atomId(key),
      text: found.get(key)!.text,
      group: found.get(key)!.group,
      uses: uses.get(key) ?? 0,
      example: example.get(key) ?? found.get(key)!.text,
    }))
    // Atoms that no sentence uses (a fragment of a message that never speaks) are not worth recording.
    .filter((atom) => atom.uses > 0)
    .sort((a, b) => b.uses - a.uses || a.text.localeCompare(b.text, locale));

  const position = new Map(atoms.map((atom, i) => [atom.key, i]));
  const remap = (needs: Iterable<number>) =>
    [...needs].map((i) => position.get(keys[i]!)!).sort((a, b) => a - b);

  return {
    locale,
    atoms,
    sentences: sentences.length,
    routes: [...routeNeeds.entries()].sort((a, b) => a[0] - b[0]).map(([, set]) => remap(set)),
    extras: extras.map((needs) => remap(needs)),
    uncovered,
  };
}

export interface Coverage {
  readonly atomsDone: number;
  readonly atomsTotal: number;
  /** Routes whose every sentence can be spoken from recordings alone. */
  readonly routesFull: number;
  readonly routesTotal: number;
}

/** How much of the app a set of recorded atoms (by key) can already speak. */
export function coverage(catalogue: Catalogue, recorded: ReadonlySet<string>): Coverage {
  const done = catalogue.atoms.map((atom) => recorded.has(atom.key));
  const full = (needs: readonly number[]) => needs.every((i) => done[i]);
  return {
    atomsDone: done.filter(Boolean).length,
    atomsTotal: catalogue.atoms.length,
    routesFull: catalogue.routes.filter(full).length,
    routesTotal: catalogue.routes.length,
  };
}
