import type { Locale, Place } from '../domain/types';

const TASHKEEL = /[ً-ٰٟـ]/g;

/**
 * Folds the spelling variants people actually type: hamza forms, taa marbuta,
 * alif maqsura, tatweel and diacritics, plus the definite article "ال".
 * "الصيدليّة", "صيدليه" and "صيدلية" all become "صيدليه".
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.startsWith('ال') && word.length > 3 ? word.slice(2) : word))
    .join(' ');
}

interface Indexed {
  readonly place: Place;
  readonly names: readonly string[];
  readonly words: readonly string[];
}

function index(place: Place, categoryLabels: Readonly<Record<string, string>>): Indexed {
  const names = [place.name.ar, place.name.en, place.short?.ar, place.short?.en]
    .filter((s): s is string => Boolean(s))
    .map(normalize);
  const extra = [...(place.keywords ?? []), categoryLabels[place.category] ?? ''].map(normalize);
  return { place, names, words: [...names, ...extra].flatMap((s) => s.split(' ')).filter(Boolean) };
}

/**
 * Ranks places for a free-text query. Every query word must match something;
 * a match at the start of the place's name ranks highest.
 */
export function searchPlaces(
  query: string,
  places: readonly Place[],
  categoryLabels: Readonly<Record<string, string>> = {},
  locale: Locale = 'ar',
): Place[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [...places];

  const scored: { place: Place; score: number }[] = [];
  for (const entry of places.map((place) => index(place, categoryLabels))) {
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      if (entry.names.some((name) => name.startsWith(term))) score += 6;
      else if (entry.words.some((word) => word.startsWith(term))) score += 4;
      else if (term.length >= 3 && entry.words.some((word) => word.includes(term))) score += 2;
      else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) scored.push({ place: entry.place, score });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.place.floor - b.place.floor ||
        a.place.name[locale].localeCompare(b.place.name[locale], locale),
    )
    .map((entry) => entry.place);
}
