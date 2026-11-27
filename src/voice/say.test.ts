import { describe, expect, it } from 'vitest';
import { createSayer, type Recorded, type Synthetic } from './say';

function setup(
  options: { covers?: boolean; plays?: boolean; loaded?: boolean; marks?: boolean } = {},
) {
  let loaded = options.loaded ?? true;
  let finishLoading: () => void = () => undefined;
  const log: string[] = [];
  const resolvers: ((played: boolean) => void)[] = [];
  const recorded: Recorded = {
    canSpeak: () => options.covers ?? true,
    speak: (text) => {
      log.push(`recorded:${text}`);
      return new Promise((r) => {
        resolvers.push(r);
        if (options.plays !== undefined) r(options.plays);
      });
    },
    cancel: () => void log.push('recorded.cancel'),
    loaded: () => loaded,
    ready: () =>
      new Promise<void>((resolve) => {
        finishLoading = () => {
          loaded = true;
          resolve();
        };
      }),
  };
  const synthetic: Synthetic = {
    speak: (text) => void log.push(`synthetic:${text}`),
    cancel: () => void log.push('synthetic.cancel'),
  };
  return {
    sayer: createSayer(
      recorded,
      synthetic,
      options.marks ? (text) => `marked(${text})` : undefined,
    ),
    log,
    finishLoading: () => finishLoading(),
    /** Settles the nth recorded sentence (0 = the first one spoken). */
    resolve: (played: boolean, nth = resolvers.length - 1) => resolvers[nth]?.(played),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSayer', () => {
  it('uses the recording when it covers the sentence', async () => {
    const { sayer, log } = setup({ plays: true });
    sayer.say('مسافة', 'ar', 'normal');
    await flush();
    expect(log).toEqual(['synthetic.cancel', 'recorded:مسافة']);
  });

  it('uses the device voice when the recording does not cover it', () => {
    const { sayer, log } = setup({ covers: false });
    sayer.say('مسافة', 'ar', 'normal');
    expect(log).toEqual(['synthetic.cancel', 'recorded.cancel', 'synthetic:مسافة']);
  });

  it('uses the device voice when the person turned the recorded voice off', () => {
    const { sayer, log } = setup({ covers: true });
    sayer.say('مسافة', 'ar', 'normal', false);
    expect(log.at(-1)).toBe('synthetic:مسافة');
  });

  it('falls back to the device voice when a recording could not be played', async () => {
    const { sayer, log } = setup({ plays: false });
    sayer.say('مسافة', 'ar', 'normal');
    await flush();
    expect(log.at(-1)).toBe('synthetic:مسافة');
  });

  it('does not let a late fallback talk over a newer sentence', async () => {
    const { sayer, log, resolve } = setup({});
    sayer.say('first', 'ar', 'normal');
    sayer.say('second', 'ar', 'normal');
    resolve(false, 0);
    await flush();
    expect(log.filter((entry) => entry.startsWith('synthetic:'))).toEqual([]);
    // The newer sentence, though, still falls back if it fails.
    resolve(false, 1);
    await flush();
    expect(log.filter((entry) => entry.startsWith('synthetic:'))).toEqual(['synthetic:second']);
  });

  it('stops everything, and a fallback that was waiting never starts', async () => {
    const { sayer, log, resolve } = setup({});
    sayer.say('first', 'ar', 'normal');
    sayer.stop();
    resolve(false);
    await flush();
    expect(log).toContain('recorded.cancel');
    expect(log.filter((entry) => entry.startsWith('synthetic:'))).toEqual([]);
  });

  it('waits for a pack that is still loading, then uses it', async () => {
    const { sayer, log, finishLoading } = setup({ plays: true, loaded: false });
    sayer.say('مسافة', 'ar', 'normal');
    await flush();
    expect(log).toEqual(['synthetic.cancel']); // nothing spoken yet, and not by the device either
    finishLoading();
    await flush();
    expect(log).toEqual(['synthetic.cancel', 'recorded:مسافة']);
  });

  it('after waiting, still falls back to the device voice when the pack cannot say it', async () => {
    const { sayer, log, finishLoading } = setup({ covers: false, loaded: false });
    sayer.say('كلمة', 'ar', 'normal');
    finishLoading();
    await flush();
    expect(log).toEqual(['synthetic.cancel', 'recorded.cancel', 'synthetic:كلمة']);
  });

  it('drops a sentence that was waiting for the pack when a newer one or stop arrives', async () => {
    const { sayer, log, finishLoading } = setup({ plays: true, loaded: false });
    sayer.say('الأولى', 'ar', 'normal');
    sayer.stop();
    finishLoading();
    await flush();
    expect(log.some((entry) => entry.startsWith('recorded:'))).toBe(false);
    expect(log.some((entry) => entry.startsWith('synthetic:'))).toBe(false);
  });

  describe('vowel marks', () => {
    it('gives the device voice the marked sentence and the recorded voice the plain one', async () => {
      const covered = setup({ marks: true, covers: true, plays: true });
      covered.sayer.say('مسافة', 'ar', 'normal');
      await flush();
      expect(covered.log).toEqual(['synthetic.cancel', 'recorded:مسافة']);

      const uncovered = setup({ marks: true, covers: false });
      uncovered.sayer.say('مسافة', 'ar', 'normal');
      expect(uncovered.log.at(-1)).toBe('synthetic:marked(مسافة)');
    });

    it('marks the sentence for the device voice when a recording could not be played', async () => {
      const { sayer, log } = setup({ marks: true, plays: false });
      sayer.say('مسافة', 'ar', 'normal');
      await flush();
      expect(log.at(-1)).toBe('synthetic:marked(مسافة)');
    });

    it('speaks the sentence as written when the person turned the marks off', () => {
      const { sayer, log } = setup({ marks: true, covers: false });
      sayer.say('مسافة', 'ar', 'normal', true, false);
      expect(log.at(-1)).toBe('synthetic:مسافة');
    });
  });
});
