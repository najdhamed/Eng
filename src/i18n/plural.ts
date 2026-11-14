import type { Locale } from '../domain/types';

export type CountUnit = 'meters' | 'minutes' | 'floors' | 'steps' | 'places';

type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/**
 * Arabic has six plural categories (zero, one, two, few, many, other), and
 * counted nouns change with each one: مترين، 5 أمتار، 15 متر. Intl.PluralRules
 * picks the category; these tables pick the word.
 */
const FORMS: Record<Locale, Record<CountUnit, Forms>> = {
  ar: {
    meters: { one: 'متر واحد', two: 'مترين', few: '{n} أمتار', other: '{n} متر' },
    minutes: { one: 'دقيقة', two: 'دقيقتين', few: '{n} دقايق', other: '{n} دقيقة' },
    floors: { one: 'دور واحد', two: 'دورين', few: '{n} أدوار', other: '{n} دور' },
    steps: { one: 'خطوة وحدة', two: 'خطوتين', few: '{n} خطوات', other: '{n} خطوة' },
    places: { one: 'مكان واحد', two: 'مكانين', few: '{n} أماكن', other: '{n} مكان' },
  },
  en: {
    meters: { one: '{n} metre', other: '{n} metres' },
    minutes: { one: '{n} minute', other: '{n} minutes' },
    floors: { one: '{n} floor', other: '{n} floors' },
    steps: { one: '{n} step', other: '{n} steps' },
    places: { one: '{n} place', other: '{n} places' },
  },
};

const RULES: Record<Locale, Intl.PluralRules> = {
  ar: new Intl.PluralRules('ar'),
  en: new Intl.PluralRules('en'),
};

export function formatCount(locale: Locale, unit: CountUnit, n: number): string {
  const forms = FORMS[locale][unit];
  const template = forms[RULES[locale].select(n)] ?? forms.other;
  return template.replace('{n}', String(n));
}

/** Distances are spoken rounded to the nearest 5 m: nobody counts metres in a corridor. */
export function roundMeters(meters: number): number {
  return Math.max(5, Math.round(meters / 5) * 5);
}

export function roundMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}
