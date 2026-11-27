import { APP_VERSION } from '../config';
import { findPlace } from '../domain/hospital';
import type { Locale, Mobility } from '../domain/types';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * "Was the route right?" answers, asked once a visitor arrives.
 *
 * There is no server: answers stay in this browser (Settings can copy them out
 * or wipe them). No name, no position and no free identifier is stored, only
 * which two places the route joined and what the visitor said about it.
 */

export type Verdict = 'right' | 'wrong';

/** What went wrong, as a short list to tick: faster than typing on a phone, easy to count later. */
export const REASONS = ['step', 'floor', 'sign', 'long', 'voice', 'other'] as const;
export type Reason = (typeof REASONS)[number];

export interface FeedbackEntry {
  /** When it was given (ISO 8601, UTC). */
  readonly at: string;
  readonly from: string;
  readonly to: string;
  readonly verdict: Verdict;
  readonly reasons: readonly Reason[];
  readonly note: string;
  readonly mobility: Mobility;
  /** The visitor was walked along by the live guidance (not only tapping through the steps). */
  readonly guided: boolean;
  readonly locale: Locale;
  readonly version: string;
}

export const FEEDBACK_KEY = 'feedback';
/** The oldest answers drop off, so a phone left in a corridor does not fill its storage. */
export const MAX_ENTRIES = 200;
export const NOTE_MAX = 280;
/** An answer this recent stands for the route just walked: a refresh does not ask again. */
export const ANSWER_WINDOW_MS = 30 * 60 * 1000;

const MOBILITIES: readonly Mobility[] = ['walk', 'wheelchair', 'stroller'];

const isReason = (value: unknown): value is Reason => REASONS.includes(value as Reason);

/** One stored entry, or null when it is not a usable answer (an older version, a hand-edited value). */
function sanitizeEntry(raw: unknown): FeedbackEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at))) return null;
  if (typeof entry.from !== 'string' || typeof entry.to !== 'string') return null;
  if (entry.verdict !== 'right' && entry.verdict !== 'wrong') return null;
  const reasons = Array.isArray(entry.reasons) ? entry.reasons.filter(isReason) : [];
  return {
    at: entry.at,
    from: entry.from,
    to: entry.to,
    verdict: entry.verdict,
    reasons: entry.verdict === 'wrong' ? [...new Set(reasons)] : [],
    note: typeof entry.note === 'string' && entry.verdict === 'wrong' ? cleanNote(entry.note) : '',
    mobility: MOBILITIES.includes(entry.mobility as Mobility)
      ? (entry.mobility as Mobility)
      : 'walk',
    guided: entry.guided === true,
    locale: entry.locale === 'en' ? 'en' : 'ar',
    version: typeof entry.version === 'string' ? entry.version.slice(0, 20) : '',
  };
}

/** Tidy text from a phone keyboard: one line of spaces, trimmed, never longer than NOTE_MAX. */
export function cleanNote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

export function sanitizeFeedback(raw: unknown): FeedbackEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: FeedbackEntry[] = [];
  for (const item of raw) {
    const entry = sanitizeEntry(item);
    if (entry) entries.push(entry);
  }
  return entries.slice(-MAX_ENTRIES);
}

export const readFeedback = (): FeedbackEntry[] =>
  sanitizeFeedback(readJSON<unknown>(FEEDBACK_KEY, []));

export interface NewFeedback {
  readonly from: string;
  readonly to: string;
  readonly verdict: Verdict;
  readonly reasons?: readonly Reason[];
  readonly note?: string;
  readonly mobility: Mobility;
  readonly guided: boolean;
  readonly locale: Locale;
}

/** Saves one answer (the oldest drop off past MAX_ENTRIES) and returns the new entry. */
export function addFeedback(answer: NewFeedback, now: Date = new Date()): FeedbackEntry {
  const entry = sanitizeEntry({
    ...answer,
    at: now.toISOString(),
    version: APP_VERSION,
  });
  if (!entry) throw new Error('feedback needs a verdict and two places');
  writeJSON(FEEDBACK_KEY, [...readFeedback(), entry].slice(-MAX_ENTRIES));
  return entry;
}

/** Takes one answer back (the visitor tapped the wrong button). */
export function removeFeedback(at: string): void {
  writeJSON(
    FEEDBACK_KEY,
    readFeedback().filter((entry) => entry.at !== at),
  );
}

export const clearFeedback = (): void => removeKey(FEEDBACK_KEY);

/** The answer already given for this very route a moment ago, if any. */
export function recentAnswer(
  entries: readonly FeedbackEntry[],
  from: string,
  to: string,
  now: Date = new Date(),
): FeedbackEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]!;
    const age = now.getTime() - Date.parse(entry.at);
    if (age > ANSWER_WINDOW_MS) return null;
    if (entry.from === from && entry.to === to && age >= -60_000) return entry;
  }
  return null;
}

export interface FeedbackTotals {
  readonly total: number;
  readonly right: number;
  readonly wrong: number;
}

export function totals(entries: readonly FeedbackEntry[]): FeedbackTotals {
  const right = entries.filter((entry) => entry.verdict === 'right').length;
  return { total: entries.length, right, wrong: entries.length - right };
}

const COLUMNS = [
  'time',
  'from_id',
  'from',
  'to_id',
  'to',
  'verdict',
  'reasons',
  'note',
  'mobility',
  'guided',
  'language',
  'version',
] as const;

/**
 * One CSV cell. A cell that starts like a formula (=, +, -, @) is prefixed with
 * a quote so a spreadsheet shows it as text instead of running it.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Every answer as CSV (header first), ready to paste into a spreadsheet. */
export function feedbackCsv(entries: readonly FeedbackEntry[]): string {
  const rows = entries.map((entry) =>
    [
      entry.at,
      entry.from,
      findPlace(entry.from)?.name.en ?? '',
      entry.to,
      findPlace(entry.to)?.name.en ?? '',
      entry.verdict,
      entry.reasons.join(' '),
      entry.note,
      entry.mobility,
      entry.guided ? 'yes' : 'no',
      entry.locale,
      entry.version,
    ]
      .map(csvCell)
      .join(','),
  );
  return [COLUMNS.join(','), ...rows].join('\r\n');
}
