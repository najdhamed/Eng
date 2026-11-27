import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_START_ID } from '../domain/hospital';
import {
  ANSWER_WINDOW_MS,
  FEEDBACK_KEY,
  MAX_ENTRIES,
  NOTE_MAX,
  addFeedback,
  cleanNote,
  clearFeedback,
  csvCell,
  feedbackCsv,
  readFeedback,
  recentAnswer,
  removeFeedback,
  sanitizeFeedback,
  totals,
  type NewFeedback,
} from './feedback';

const answer = (patch: Partial<NewFeedback> = {}): NewFeedback => ({
  from: DEFAULT_START_ID,
  to: '0-cafeteria',
  verdict: 'right',
  mobility: 'walk',
  guided: false,
  locale: 'ar',
  ...patch,
});

/** The tests run in Node, which has no localStorage: a small stand-in with the same calls. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});

describe('saving answers', () => {
  it('keeps what was said and nothing that identifies the visitor', () => {
    const saved = addFeedback(
      answer({
        verdict: 'wrong',
        reasons: ['floor', 'floor', 'sign'],
        note: '  الدرج\n على اليسار  ',
      }),
      new Date('2026-11-27T00:10:00Z'),
    );
    expect(saved).toMatchObject({
      at: '2026-11-27T00:10:00.000Z',
      verdict: 'wrong',
      reasons: ['floor', 'sign'],
      note: 'الدرج على اليسار',
      mobility: 'walk',
    });
    expect(Object.keys(saved).sort()).toEqual(
      [
        'at',
        'from',
        'guided',
        'locale',
        'mobility',
        'note',
        'reasons',
        'to',
        'verdict',
        'version',
      ].sort(),
    );
    expect(readFeedback()).toEqual([saved]);
  });

  it('drops reasons and notes from a "right" answer', () => {
    const saved = addFeedback(answer({ reasons: ['step'], note: 'مرحبا' }));
    expect(saved.reasons).toEqual([]);
    expect(saved.note).toBe('');
  });

  it('refuses an answer that says neither right nor wrong', () => {
    expect(() => addFeedback(answer({ verdict: 'maybe' as never }))).toThrow();
  });

  it('keeps only the newest answers when there are too many', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
      addFeedback(answer({ to: `p${i}` }), new Date(Date.UTC(2026, 10, 27, 0, 0, i)));
    }
    const entries = readFeedback();
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(entries.at(-1)?.to).toBe(`p${MAX_ENTRIES + 4}`);
    expect(entries[0]?.to).toBe('p5');
  });

  it('takes one answer back, or all of them', () => {
    const first = addFeedback(answer(), new Date('2026-11-27T00:00:00Z'));
    addFeedback(answer({ verdict: 'wrong' }), new Date('2026-11-27T00:01:00Z'));
    removeFeedback(first.at);
    expect(readFeedback().map((entry) => entry.verdict)).toEqual(['wrong']);
    clearFeedback();
    expect(readFeedback()).toEqual([]);
  });
});

describe('reading what is stored', () => {
  it('survives anything the storage holds', () => {
    for (const junk of ['null', '"text"', '{"a":1}', '[1,2,null]', '[{"verdict":"right"}]', '{']) {
      store.set(`darbak:${FEEDBACK_KEY}`, junk);
      expect(readFeedback()).toEqual([]);
    }
  });

  it('repairs a half-valid entry instead of throwing it away', () => {
    const [entry] = sanitizeFeedback([
      {
        at: '2026-11-27T00:00:00Z',
        from: 'a',
        to: 'b',
        verdict: 'wrong',
        reasons: ['voice', 'nonsense', 7],
        note: 5,
        mobility: 'jetpack',
        locale: 'fr',
      },
    ]);
    expect(entry).toMatchObject({
      reasons: ['voice'],
      note: '',
      mobility: 'walk',
      locale: 'ar',
      guided: false,
    });
  });

  it('cuts a long note and flattens its lines', () => {
    expect(cleanNote('x'.repeat(NOTE_MAX + 50))).toHaveLength(NOTE_MAX);
    expect(cleanNote('a\n\n  b\t c')).toBe('a b c');
  });
});

describe('recognising the route just answered', () => {
  const now = new Date('2026-11-27T01:00:00Z');
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

  it('finds an answer for the same route within half an hour', () => {
    addFeedback(answer(), at(5));
    const entries = readFeedback();
    expect(recentAnswer(entries, DEFAULT_START_ID, '0-cafeteria', now)?.verdict).toBe('right');
    expect(recentAnswer(entries, DEFAULT_START_ID, '0-pharmacy', now)).toBeNull();
  });

  it('asks again for an old answer, so a later visit is not skipped', () => {
    addFeedback(answer(), at(ANSWER_WINDOW_MS / 60_000 + 1));
    expect(recentAnswer(readFeedback(), DEFAULT_START_ID, '0-cafeteria', now)).toBeNull();
  });
});

describe('totals', () => {
  it('counts right and wrong answers', () => {
    addFeedback(answer(), new Date('2026-11-27T00:00:00Z'));
    addFeedback(answer({ verdict: 'wrong' }), new Date('2026-11-27T00:01:00Z'));
    addFeedback(answer({ verdict: 'wrong' }), new Date('2026-11-27T00:02:00Z'));
    expect(totals(readFeedback())).toEqual({ total: 3, right: 1, wrong: 2 });
    expect(totals([])).toEqual({ total: 0, right: 0, wrong: 0 });
  });
});

describe('CSV', () => {
  it('quotes what needs quoting', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('stops a spreadsheet from running a note that looks like a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('has a header, then one line per answer with the place names', () => {
    addFeedback(
      answer({
        verdict: 'wrong',
        reasons: ['floor', 'voice'],
        note: 'لفّيت يمين, والدرج يسار',
        guided: true,
      }),
      new Date('2026-11-27T00:00:00Z'),
    );
    const [header, row, extra] = feedbackCsv(readFeedback()).split('\r\n');
    expect(header).toBe(
      'time,from_id,from,to_id,to,verdict,reasons,note,mobility,guided,language,version',
    );
    expect(row).toContain('2026-11-27T00:00:00.000Z');
    expect(row).toContain(',wrong,floor voice,"لفّيت يمين, والدرج يسار",walk,yes,ar,');
    expect(row).toContain('Cafeteria');
    expect(extra).toBeUndefined();
  });

  it('is just the header when there is nothing', () => {
    expect(feedbackCsv([])).toBe(
      'time,from_id,from,to_id,to,verdict,reasons,note,mobility,guided,language,version',
    );
  });
});
