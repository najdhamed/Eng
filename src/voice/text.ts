/**
 * Text helpers for the recorded voice pack.
 *
 * A recording is a short phrase (an "atom"): a fixed piece of a sentence, a
 * number with its unit, a place name. A spoken sentence is rebuilt by finding
 * the fewest recorded atoms that spell it out, word for word. If any word is
 * missing, the whole sentence is left to the device's own voice, so a sentence
 * is never half one voice and half another.
 */

const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
const PUNCTUATION = /[.,،؛;:!?؟"'“”‘’«»()[\]{}…\-–—/\\|_*+=<>~^`@#$%&]/g;
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Strips vowel marks, tatweel and punctuation, turns every digit into 0-9 and lowercases Latin. */
export function normalizeSpeech(text: string): string {
  return text
    .replace(DIACRITICS, '')
    .replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf))
    .replace(PUNCTUATION, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const wordsOf = (normalized: string): string[] => (normalized ? normalized.split(' ') : []);

/** A short, stable file name for an atom (FNV-1a over its normalised text). */
export function atomId(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Covers `text` with the fewest atoms from `known` (normalised atom texts).
 * Returns them in order, or null when some word cannot be covered.
 */
export function segment(text: string, known: ReadonlySet<string>): string[] | null {
  const words = wordsOf(normalizeSpeech(text));
  if (words.length === 0) return [];

  const byFirstWord = new Map<string, { key: string; words: string[] }[]>();
  for (const key of known) {
    const atom = wordsOf(key);
    const first = atom[0];
    if (!first) continue;
    const list = byFirstWord.get(first);
    if (list) list.push({ key, words: atom });
    else byFirstWord.set(first, [{ key, words: atom }]);
  }

  const best: number[] = new Array<number>(words.length + 1).fill(Infinity);
  const next: ({ key: string; length: number } | null)[] = new Array<null>(words.length + 1).fill(
    null,
  );
  best[words.length] = 0;

  for (let i = words.length - 1; i >= 0; i -= 1) {
    for (const atom of byFirstWord.get(words[i]!) ?? []) {
      const end = i + atom.words.length;
      if (end > words.length || best[end] === Infinity) continue;
      if (!atom.words.every((word, offset) => words[i + offset] === word)) continue;
      // Fewest clips first; among equals prefer the longer first atom (fewer joins early on).
      const count = 1 + best[end]!;
      if (count < best[i]! || (count === best[i] && atom.words.length > (next[i]?.length ?? 0))) {
        best[i] = count;
        next[i] = { key: atom.key, length: atom.words.length };
      }
    }
  }
  if (best[0] === Infinity) return null;

  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const step = next[i]!;
    out.push(step.key);
    i += step.length;
  }
  return out;
}

const ONES = [
  'صفر',
  'واحد',
  'اثنين',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'إحدى عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];
const TENS = ['', '', 'عشرين', 'ثلاثين', 'أربعين', 'خمسين', 'ستين', 'سبعين', 'ثمانين', 'تسعين'];
const HUNDREDS = [
  '',
  'مية',
  'ميتين',
  'ثلاث مية',
  'أربع مية',
  'خمس مية',
  'ست مية',
  'سبع مية',
  'ثمان مية',
  'تسع مية',
];

/** A whole number as Arabic words ("35" → "خمسة وثلاثين"), to show a speaker how to read it. */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return ONES[n]!;
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]!);
    else {
      const tens = TENS[Math.floor(rest / 10)]!;
      const ones = rest % 10;
      parts.push(ones ? `${ONES[ones]!} و${tens}` : tens);
    }
  }
  return parts.join(' و');
}

/** Replaces each whole number in `text` with its Arabic words. */
export function spellNumbers(text: string): string {
  return text.replace(/\d+/g, (digits) => numberWords(Number(digits)));
}
