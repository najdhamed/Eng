import { describe, expect, it } from 'vitest';
import { createSayer, type Recorded, type Synthetic } from './say';

function setup(options: { covers?: boolean; plays?: boolean } = {}) {
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
  };
  const synthetic: Synthetic = {
    speak: (text) => void log.push(`synthetic:${text}`),
    cancel: () => void log.push('synthetic.cancel'),
  };
  return {
    sayer: createSayer(recorded, synthetic),
    log,
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
});
