import { describe, expect, it } from 'vitest';
import { rankVoices, type VoiceLike } from './speech';

const v = (name: string, lang: string, localService = true): VoiceLike => ({
  name,
  lang,
  localService,
});

describe('rankVoices', () => {
  const voices = [
    v('Samantha', 'en-US'),
    v('Hoda', 'ar-EG'),
    v('Google العربية', 'ar'),
    v('Zayed', 'ar-AE'),
    v('Majed', 'ar-SA'),
    v('Karen', 'en-AU'),
  ];

  it('puts the Saudi voice first, then other Gulf voices, then any Arabic', () => {
    expect(rankVoices(voices, 'ar').map((r) => r.name)).toEqual([
      'Majed',
      'Zayed',
      'Google العربية',
      'Hoda',
    ]);
  });

  it('leaves out voices in other languages', () => {
    expect(rankVoices(voices, 'ar').some((r) => r.lang.startsWith('en'))).toBe(false);
    expect(rankVoices(voices, 'en').every((r) => r.lang.startsWith('en'))).toBe(true);
  });

  it('marks which voice is Saudi', () => {
    const ranked = rankVoices(voices, 'ar');
    expect(ranked.filter((r) => r.saudi).map((r) => r.name)).toEqual(['Majed']);
  });

  it('accepts underscores in language tags, as some Android voices use', () => {
    expect(rankVoices([v('Android Arabic', 'ar_SA')], 'ar')[0]).toMatchObject({ saudi: true });
  });

  it('prefers a natural or neural voice among equals, and a local one over an online one', () => {
    const two = rankVoices(
      [v('Plain', 'ar-SA'), v('Microsoft Naayf Online (Natural)', 'ar-SA', false)],
      'ar',
    );
    expect(two[0]!.name).toContain('Natural');
    const local = rankVoices([v('A remote', 'ar-SA', false), v('B local', 'ar-SA', true)], 'ar');
    expect(local[0]!.name).toBe('B local');
  });

  it('is stable for equal voices and empty for none', () => {
    expect(rankVoices([v('B', 'ar-SA'), v('A', 'ar-SA')], 'ar').map((r) => r.name)).toEqual([
      'A',
      'B',
    ]);
    expect(rankVoices([], 'ar')).toEqual([]);
  });
});
