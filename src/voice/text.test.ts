import { describe, expect, it } from 'vitest';
import { atomId, normalizeSpeech, numberWords, segment, spellNumbers } from './text';

const atoms = (...texts: string[]) => new Set(texts.map(normalizeSpeech));

describe('normalizeSpeech', () => {
  it('drops vowel marks, tatweel and punctuation', () => {
    expect(normalizeSpeech('خُش من البوابة الرئيسيّة.')).toBe('خش من البوابة الرئيسية');
    expect(normalizeSpeech('لـعيادات، الباطنية!')).toBe('لعيادات الباطنية');
  });

  it('turns Arabic-Indic digits into Western ones', () => {
    expect(normalizeSpeech('٣٥ متر')).toBe('35 متر');
    expect(normalizeSpeech('۱۲ دقيقة')).toBe('12 دقيقة');
  });

  it('lowercases Latin text and collapses spaces', () => {
    expect(normalizeSpeech('  Turn   LEFT, then  walk. ')).toBe('turn left then walk');
  });

  it('is idempotent', () => {
    const once = normalizeSpeech('مسافة ٣٥ متر، لين توصل المصاعد.');
    expect(normalizeSpeech(once)).toBe(once);
  });
});

describe('atomId', () => {
  it('is stable, short and different for different text', () => {
    expect(atomId('خمسة')).toBe(atomId('خمسة'));
    expect(atomId('خمسة')).toMatch(/^[0-9a-f]{8}$/);
    expect(atomId('خمسة')).not.toBe(atomId('ستة'));
  });
});

describe('segment', () => {
  const known = atoms('امش سيدا', 'مسافة', '35 متر', 'لين توصل', 'المصاعد', 'لف يمين');

  it('covers a sentence with the atoms that spell it out', () => {
    expect(segment('امشِ سيدا. مسافة 35 متر لين توصل المصاعد.', known)).toEqual(
      ['امش سيدا', 'مسافة', '35 متر', 'لين توصل', 'المصاعد'].map(normalizeSpeech),
    );
  });

  it('ignores punctuation and marks when matching', () => {
    expect(segment('لُفّ يمين!', atoms('لف يمين'))).toEqual(['لف يمين']);
  });

  it('returns null when a single word is missing', () => {
    expect(segment('امش سيدا. مسافة 40 متر', known)).toBeNull();
    expect(segment('لف يسار', known)).toBeNull();
  });

  it('prefers fewer, longer atoms when both would do', () => {
    const both = atoms('امش', 'سيدا', 'امش سيدا');
    expect(segment('امش سيدا', both)).toEqual(['امش سيدا']);
  });

  it('finds a cover that a greedy match would miss', () => {
    // Greedy would take "a b" first and strand "c d e"; the cover is "a" + "b c" + "d e".
    const tricky = new Set(['a b', 'a', 'b c', 'd e']);
    expect(segment('a b c d e', tricky)).toEqual(['a', 'b c', 'd e']);
  });

  it('treats the empty sentence as covered by nothing', () => {
    expect(segment('', known)).toEqual([]);
    expect(segment(' . ', known)).toEqual([]);
  });

  it('copes with a long sentence and many atoms', () => {
    const words = Array.from({ length: 300 }, (_, i) => `w${i}`);
    const many = new Set<string>();
    for (let i = 0; i < 300; i += 1) many.add(words[i]!);
    for (let i = 0; i < 299; i += 3) many.add(`${words[i]!} ${words[i + 1]!}`);
    expect(segment(words.join(' '), many)?.length).toBeLessThanOrEqual(300);
  });
});

describe('numberWords', () => {
  it('spells the numbers the app speaks', () => {
    expect(numberWords(5)).toBe('خمسة');
    expect(numberWords(15)).toBe('خمسة عشر');
    expect(numberWords(35)).toBe('خمسة وثلاثين');
    expect(numberWords(40)).toBe('أربعين');
    expect(numberWords(100)).toBe('مية');
    expect(numberWords(125)).toBe('مية وخمسة وعشرين');
  });

  it('leaves numbers it cannot spell as digits', () => {
    expect(numberWords(1500)).toBe('1500');
    expect(numberWords(-3)).toBe('-3');
    expect(numberWords(2.5)).toBe('2.5');
  });

  it('spells every number in a phrase', () => {
    expect(spellNumbers('35 متر')).toBe('خمسة وثلاثين متر');
    expect(spellNumbers('الدور 2 من 4')).toBe('الدور اثنين من أربعة');
  });
});
