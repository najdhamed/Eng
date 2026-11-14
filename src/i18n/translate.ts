import type { FloorId, Locale, Localized } from '../domain/types';
import { ar, type MessageKey } from './ar';
import { en } from './en';
import { formatCount, roundMeters, roundMinutes, type CountUnit } from './plural';

export type { MessageKey };
export type Vars = Readonly<Record<string, string | number>>;

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ar, en };

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = MESSAGES[locale][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Everything that turns data into words for one locale. Pure, so it is easy to test. */
export interface Translator {
  readonly locale: Locale;
  readonly dir: 'rtl' | 'ltr';
  t(key: MessageKey, vars?: Vars): string;
  count(unit: CountUnit, n: number): string;
  name(text: Localized): string;
  /** "to the pharmacy": لل/لـ in Arabic, "to" in English. */
  toPlace(name: string): string;
  floorName(floor: FloorId): string;
  floorTo(floor: FloorId): string;
  floorShort(floor: FloorId): string;
  distance(meters: number): string;
  duration(seconds: number): string;
  /** Joins clauses with the locale's comma. */
  list(parts: readonly (string | false | null | undefined)[]): string;
}

export function createTranslator(locale: Locale): Translator {
  const t = (key: MessageKey, vars?: Vars) => translate(locale, key, vars);
  const count = (unit: CountUnit, n: number) => formatCount(locale, unit, n);
  return {
    locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    t,
    count,
    name: (text) => text[locale],
    toPlace: (name) =>
      locale === 'ar' ? (name.startsWith('ال') ? `لل${name.slice(2)}` : `لـ${name}`) : `to ${name}`,
    floorName: (floor) => t(`floor.${floor}`),
    floorTo: (floor) => t(`floorTo.${floor}`),
    floorShort: (floor) => t(`floorShort.${floor}`),
    distance: (meters) => count('meters', roundMeters(meters)),
    duration: (seconds) => count('minutes', roundMinutes(seconds)),
    list: (parts) => parts.filter(Boolean).join(locale === 'ar' ? '، ' : ', '),
  };
}
