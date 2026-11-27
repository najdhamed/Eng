import { describe, expect, it } from 'vitest';
import { buildCatalogue } from './catalogue';
import { LETTER_NAMES, LEXICON } from './lexicon.ar';
import { speechText, spokenNumber, unknownWords, vocalise, vocaliseWord } from './tashkeel';
import { normalizeSpeech } from './text';

const MARKS = /\p{M}/u;
const ARABIC_WORD = /[\p{Script=Arabic}\p{M}]+/gu;

describe('the pronunciation lexicon', () => {
  it('only adds vowel marks: take them off and each entry is its key again', () => {
    for (const [key, marked] of Object.entries(LEXICON)) {
      expect(normalizeSpeech(marked), key).toBe(key);
    }
  });

  it('is keyed the way normalizeSpeech writes words', () => {
    for (const key of Object.keys(LEXICON)) expect(normalizeSpeech(key), key).toBe(key);
  });

  it('gives every word at least one vowel mark', () => {
    for (const [key, marked] of Object.entries(LEXICON)) expect(marked, key).toMatch(MARKS);
  });

  it('writes each mark after its letter: no mark opens a word or follows another mark twice', () => {
    for (const [key, marked] of Object.entries(LEXICON)) {
      expect(marked, key).not.toMatch(/^[ً-ٰٟ]/);
      expect(marked, key).not.toMatch(/ََ|ُُ|ِِ/);
    }
  });

  it('knows every word the app can say, so none is left to the voice to guess', () => {
    const { atoms } = buildCatalogue('ar');
    const missing = new Set<string>();
    for (const atom of atoms) for (const word of unknownWords(atom.text)) missing.add(word);
    // If this fails, a place or message was added: add its words to lexicon.ar.ts
    // (`npm run voice:tashkeel -- "word"` drafts them).
    expect([...missing]).toEqual([]);
  });

  it('turns every phrase of the app into marked words and no digits', () => {
    for (const atom of buildCatalogue('ar').atoms) {
      const spoken = vocalise(atom.text);
      expect(spoken, atom.text).not.toMatch(/[0-9٠-٩]/);
      for (const word of spoken.match(ARABIC_WORD) ?? []) expect(word, atom.text).toMatch(MARKS);
    }
  });

  it('keeps the same words: removing the marks gives back the sentence, apart from numbers and letters', () => {
    for (const atom of buildCatalogue('ar').atoms) {
      if (/[0-9A-Za-z]|\s[–—]\s|(^|\s)[أبجد]$/.test(atom.text)) continue;
      expect(normalizeSpeech(vocalise(atom.text)), atom.text).toBe(normalizeSpeech(atom.text));
    }
  });
});

describe('vocalise', () => {
  it('reads Saudi forms, not formal ones', () => {
    expect(vocalise('لف يمين')).toBe('لِفّ يَمِين');
    expect(vocalise('أنت الحين في الدور الأول')).toBe('أَنْتَ الْحِين فِي الدَّوْر الْأَوَّل');
    expect(vocalise('الدرج على يسارك')).toBe('الدَّرَج عَلَى يَسَارَك');
    expect(vocalise('لين توصل')).toBe('لِين تَوْصَل');
  });

  it('keeps punctuation and spacing, so the voice still pauses where the sentence does', () => {
    expect(vocalise('هلا والله، أنا دربك. يلا؟')).toBe('هَلَا وَاللَّه، أَنَا دَرْبَك. يَلَّا؟');
  });

  it('writes numbers as words that agree with what they count', () => {
    expect(vocalise('الطريق 6 خطوات')).toBe('الطَّرِيق سِتّ خُطُوَات');
    expect(vocalise('3 دقايق')).toBe('ثَلَاث دَقَايِق');
    expect(vocalise('10 أمتار')).toBe('عَشَرَة أَمْتَار');
    expect(vocalise('5 أمتار')).toBe('خَمْسَة أَمْتَار');
    expect(vocalise('45 متر')).toBe('خَمْسَة وَأَرْبَعِين مِتْر');
    expect(vocalise('15 متر')).toBe('خَمْسَةَ عَشَر مِتْر');
    expect(vocalise('3 أدوار')).toBe('ثَلَاثَة أَدْوَار');
    expect(vocalise('24 ساعة')).toBe('أَرْبَعَة وَعِشْرِين سَاعَة');
  });

  it('reads Eastern Arabic digits too', () => {
    expect(vocalise('٤ خطوات')).toBe('أَرْبَع خُطُوَات');
  });

  it('says times and ranges the way people do', () => {
    expect(vocalise('الدوام: 8 الصبح – 4 العصر')).toBe(
      'الدَّوَام: ثَمَانِيَة الصُّبْح إِلَى أَرْبَعَة الْعَصْر',
    );
    expect(vocalise('7:30 الصبح')).toBe('سَبْعَة وَنُصّ الصُّبْح');
    expect(vocalise('الزيارة 5 – 7 المغرب')).toBe('الزِّيَارَة خَمْسَة إِلَى سَبْعَة الْمَغْرِب');
  });

  it('reads a lone letter by its name: wing names and the lift button', () => {
    expect(vocalise('جناح التنويم ب')).toBe('جَنَاح التَّنْوِيم بَاء');
    expect(vocalise('اضغط زر G')).toBe('اِضْغَط زِرّ جِي');
    expect(vocalise('جناح التنويم أ')).toContain(LETTER_NAMES['أ']);
  });

  it('leaves a word it does not know exactly as written, and says so', () => {
    expect(vocalise('عيادة السكر')).toBe('عِيَادَة السكر');
    expect(unknownWords('عيادة السكر')).toEqual(['السكر']);
    expect(unknownWords('لف يمين')).toEqual([]);
  });

  it('does not touch text that is not Arabic', () => {
    expect(speechText('Turn left', 'en')).toBe('Turn left');
    expect(speechText('لف يمين', 'ar')).toBe('لِفّ يَمِين');
  });

  it('knows a word by its plain spelling, with or without marks already on it', () => {
    expect(vocaliseWord('خُش')).toBe('خُشّ');
    expect(vocaliseWord('امشِ')).toBe('اِمْشِ');
    expect(vocaliseWord('كلمة-غريبة')).toBeNull();
  });
});

describe('spokenNumber', () => {
  it('says 3 to 10 the opposite way round from what they count', () => {
    expect(spokenNumber(3, 'feminine')).toBe('ثَلَاث');
    expect(spokenNumber(3, 'masculine')).toBe('ثَلَاثَة');
    expect(spokenNumber(10, 'feminine')).toBe('عَشْر');
    expect(spokenNumber(10)).toBe('عَشَرَة');
  });

  it('says 1 and 2 the same for both', () => {
    expect(spokenNumber(1, 'feminine')).toBe('وَاحِد');
    expect(spokenNumber(2, 'feminine')).toBe('اِثْنَيْن');
  });

  it('says the teens, tens, and tens with units', () => {
    expect(spokenNumber(11)).toBe('أَحَدَ عَشَر');
    expect(spokenNumber(12)).toBe('اِثْنَا عَشَر');
    expect(spokenNumber(19)).toBe('تِسْعَةَ عَشَر');
    expect(spokenNumber(20)).toBe('عِشْرِين');
    expect(spokenNumber(21)).toBe('وَاحِد وَعِشْرِين');
    expect(spokenNumber(35)).toBe('خَمْسَة وَثَلَاثِين');
    expect(spokenNumber(99)).toBe('تِسْعَة وَتِسْعِين');
  });

  it('says hundreds', () => {
    expect(spokenNumber(100)).toBe('مِيَّة');
    expect(spokenNumber(200)).toBe('مِيتَيْن');
    expect(spokenNumber(350)).toBe('ثَلَاث مِيَّة وَخَمْسِين');
    expect(spokenNumber(105)).toBe('مِيَّة وَخَمْسَة');
  });

  it('gives up outside 0 to 999, so the digits are left for the voice', () => {
    expect(spokenNumber(1000)).toBeNull();
    expect(spokenNumber(-1)).toBeNull();
    expect(spokenNumber(2.5)).toBeNull();
    expect(vocalise('1500 متر')).toContain('1500');
  });
});
