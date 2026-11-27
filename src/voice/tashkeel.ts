import type { Locale } from '../domain/types';
import { LETTER_NAMES, LEXICON } from './lexicon.ar';
import { normalizeSpeech } from './text';

/**
 * Gives a spoken Arabic sentence its vowel marks and writes its numbers out as
 * words, so a voice reads it the way a Saudi would say it.
 *
 * Only the text sent to a voice changes. What is on screen, and the keys that
 * find a recorded clip, stay as they are (the clip lookup ignores marks).
 */

// An Arabic word (letters and their vowel marks), a number (or a time such as 7:30), or a Latin word.
const TOKEN = /([\p{Script=Arabic}\p{M}]+|[0-9\u0660-\u0669]+(?::[0-9]{2})?|[A-Za-z]+)/u;
const DASH_BETWEEN_WORDS = /^\s*[–—]\s*$/;
const ONLY_SPACE = /^\s+$/;

// 3 to 10 take the opposite gender from what they count: «ثلاث خطوات» but «ثلاثة أمتار».
const NUMBER_FEMININE_NOUN = [
  '',
  '',
  '',
  'ثَلَاث',
  'أَرْبَع',
  'خَمْس',
  'سِتّ',
  'سَبْع',
  'ثَمَان',
  'تِسْع',
  'عَشْر',
];
const NUMBER_MASCULINE_NOUN = [
  'صِفْر',
  'وَاحِد',
  'اِثْنَيْن',
  'ثَلَاثَة',
  'أَرْبَعَة',
  'خَمْسَة',
  'سِتَّة',
  'سَبْعَة',
  'ثَمَانِيَة',
  'تِسْعَة',
  'عَشَرَة',
];
const TEENS = [
  'أَحَدَ عَشَر',
  'اِثْنَا عَشَر',
  'ثَلَاثَةَ عَشَر',
  'أَرْبَعَةَ عَشَر',
  'خَمْسَةَ عَشَر',
  'سِتَّةَ عَشَر',
  'سَبْعَةَ عَشَر',
  'ثَمَانِيَةَ عَشَر',
  'تِسْعَةَ عَشَر',
];
const TENS = [
  '',
  '',
  'عِشْرِين',
  'ثَلَاثِين',
  'أَرْبَعِين',
  'خَمْسِين',
  'سِتِّين',
  'سَبْعِين',
  'ثَمَانِين',
  'تِسْعِين',
];
const HUNDREDS = [
  '',
  'مِيَّة',
  'مِيتَيْن',
  'ثَلَاث مِيَّة',
  'أَرْبَع مِيَّة',
  'خَمْس مِيَّة',
  'سِتّ مِيَّة',
  'سَبْع مِيَّة',
  'ثَمَان مِيَّة',
  'تِسْع مِيَّة',
];

/** Nouns that follow a number and decide how 3 to 10 are said (feminine plurals lose their ة). */
const FEMININE_NOUNS = new Set(['خطوات', 'خطوة', 'دقايق', 'دقيقة', 'ساعة', 'مرات']);

export type Gender = 'feminine' | 'masculine';

/** A whole number (0 to 999) as Saudi Arabic words with their marks, or null when it is out of range. */
export function spokenNumber(n: number, counted: Gender = 'masculine'): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null;
  if (n <= 10) {
    return (counted === 'feminine' && n >= 3 ? NUMBER_FEMININE_NOUN : NUMBER_MASCULINE_NOUN)[n]!;
  }
  if (n < 20) return TEENS[n - 11]!;
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest) {
    if (rest <= 10) parts.push(NUMBER_MASCULINE_NOUN[rest]!);
    else if (rest < 20) parts.push(TEENS[rest - 11]!);
    else {
      const ones = rest % 10;
      const tens = TENS[Math.floor(rest / 10)]!;
      parts.push(ones ? `${NUMBER_MASCULINE_NOUN[ones]!} وَ${tens}` : tens);
    }
  }
  return parts.join(' وَ');
}

const toAsciiDigits = (digits: string) =>
  digits.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));

/** «7:30» → «سَبْعَة وَنُصّ». Anything it cannot say is returned unchanged. */
function spokenTime(hours: number, minutes: number): string | null {
  const hour = spokenNumber(hours);
  if (hour === null) return null;
  if (minutes === 0) return hour;
  if (minutes === 30) return `${hour} وَنُصّ`;
  if (minutes === 15) return `${hour} وَرُبْع`;
  const minute = spokenNumber(minutes, 'feminine');
  return minute === null ? null : `${hour} وَ${minute} دَقِيقَة`;
}

function spokenNumberToken(token: string, following: string | undefined): string {
  const ascii = toAsciiDigits(token);
  if (ascii.includes(':')) {
    const [h, m] = ascii.split(':');
    return spokenTime(Number(h), Number(m)) ?? token;
  }
  const noun = following ? normalizeSpeech(following) : '';
  const gender: Gender = FEMININE_NOUNS.has(noun) ? 'feminine' : 'masculine';
  return spokenNumber(Number(ascii), gender) ?? token;
}

/** The marked form of one Arabic word, or null when this word is not known. */
export function vocaliseWord(word: string): string | null {
  return LEXICON[normalizeSpeech(word)] ?? null;
}

/**
 * Adds vowel marks to every known word of an Arabic sentence and spells its
 * numbers. Punctuation and spacing are kept, so the voice still pauses where
 * the sentence does. A word that is not in the lexicon is left as written.
 */
export function vocalise(text: string): string {
  const parts = text.split(TOKEN);
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (i % 2 === 0) {
      // Between words. «8 الصبح – 4 العصر» is said «… إلى …».
      const between = i > 0 && i < parts.length - 1;
      out += between && DASH_BETWEEN_WORDS.test(part) ? ' إِلَى ' : part;
      continue;
    }
    if (/^[0-9٠-٩]/.test(part)) {
      const next = ONLY_SPACE.test(parts[i + 1] ?? '') ? parts[i + 2] : undefined;
      out += spokenNumberToken(part, next);
    } else if (/^[A-Za-z]/.test(part)) {
      out += LETTER_NAMES[part.toLowerCase()] ?? part;
    } else {
      out += (part.length === 1 ? LETTER_NAMES[part] : undefined) ?? vocaliseWord(part) ?? part;
    }
  }
  return out;
}

/** The Arabic words of a sentence that the lexicon does not know (to find what is missing). */
export function unknownWords(text: string): string[] {
  const missing = new Set<string>();
  parts: for (const [i, part] of text.split(TOKEN).entries()) {
    if (i % 2 === 0 || !/^[ء-ۓ]/.test(part)) continue;
    if (LETTER_NAMES[part] !== undefined) continue parts;
    if (vocaliseWord(part) === null) missing.add(normalizeSpeech(part));
  }
  return [...missing];
}

/** What to send to a voice: marked and spelled in Arabic, as written in other languages. */
export function speechText(text: string, locale: Locale): string {
  return locale === 'ar' ? vocalise(text) : text;
}
