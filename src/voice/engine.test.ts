import { describe, expect, it } from 'vitest';
import type { Locale } from '../domain/types';
import { VoiceEngine, type AudioPort, type EngineDeps, type Playback } from './engine';
import { atomId, normalizeSpeech } from './text';

const bytes = (text: string) => new TextEncoder().encode(text);
interface Harness {
  engine: VoiceEngine;
  fetched: string[];
  played: { buffers: unknown[]; rate: number }[];
  stopped: number[];
  finish(): void;
  failDecode(on: boolean): void;
}

function harness(shipped: { key: string; text: string }[] = []): Harness {
  const fetched: string[] = [];
  const played: Harness['played'] = [];
  const stopped: number[] = [];
  let onEnd: () => void = () => undefined;
  let decodeFails = false;

  const audio: AudioPort = {
    decode: async (data) => {
      if (decodeFails) throw new Error('cannot decode');
      return new TextDecoder().decode(data);
    },
    play: async (buffers, rate, end) => {
      played.push({ buffers: [...buffers], rate });
      onEnd = end;
      const id = played.length;
      const playback: Playback = { stop: () => void stopped.push(id) };
      return playback;
    },
  };
  const deps: EngineDeps = {
    audio,
    fetchBytes: async (url) => {
      fetched.push(url);
      const file = url.split('/').pop()!;
      const match = shipped.find((s) => `${atomId(s.key)}.wav` === file);
      if (!match) throw new Error('404');
      return bytes(`shipped:${match.text}`);
    },
    fetchJson: async (url) => {
      if (shipped.length === 0) throw new Error('404');
      expect(url).toContain('/manifest.json');
      return {
        version: 1,
        locale: 'ar',
        clips: shipped.map((s) => ({ ...s, file: `${atomId(s.key)}.wav`, ms: 400 })),
      };
    },
    packUrl: (locale: Locale, file: string) => `/voice/${locale}/${file}`,
  };
  return {
    engine: new VoiceEngine(deps),
    fetched,
    played,
    stopped,
    finish: () => onEnd(),
    failDecode: (on) => void (decodeFails = on),
  };
}

const shippedFor = (...texts: string[]) =>
  texts.map((text) => ({ key: normalizeSpeech(text), text }));

describe('VoiceEngine: loading', () => {
  it('starts empty and says nothing from clips', async () => {
    const h = harness();
    await h.engine.load('ar');
    expect(h.engine.size('ar')).toBe(0);
    expect(h.engine.canSpeak('امش سيدا', 'ar')).toBe(false);
    expect(await h.engine.speak('امش سيدا', 'ar')).toBe(false);
    expect(h.played).toHaveLength(0);
  });

  it('loads the shipped pack', async () => {
    const h = harness(shippedFor('امش سيدا', 'مسافة'));
    await h.engine.load('ar');
    expect(h.engine.size('ar')).toBe(2);
    expect(h.engine.has('ar', normalizeSpeech('مسافة'))).toBe(true);
  });

  it('ignores a manifest it does not understand', async () => {
    const engine = new VoiceEngine({
      audio: { decode: async () => null, play: async () => ({ stop: () => undefined }) },
      fetchBytes: async () => bytes('x'),
      fetchJson: async () => ({ version: 2, clips: 'nope' }),
      packUrl: (locale: Locale, file: string) => `/voice/${locale}/${file}`,
    });
    await engine.load('ar');
    expect(engine.size('ar')).toBe(0);
    expect(engine.loaded('ar')).toBe(true);
  });

  it('keeps the two languages apart', async () => {
    const h = harness(shippedFor('turn left'));
    await h.engine.load('ar');
    expect(h.engine.size('ar')).toBe(1);
    expect(h.engine.size('en')).toBe(0);
  });

  it('loads only once, however often it is asked', async () => {
    const h = harness(shippedFor('مسافة'));
    await Promise.all([h.engine.load('ar'), h.engine.load('ar')]);
    expect(h.engine.size('ar')).toBe(1);
  });
});

describe('VoiceEngine: warming the offline cache', () => {
  it('downloads every shipped clip once', async () => {
    const h = harness(shippedFor('امش سيدا', 'مسافة', 'متر'));
    expect(await h.engine.warm('ar')).toBe(3);
    expect(h.fetched).toHaveLength(3);
    expect(h.fetched.every((url) => url.startsWith('/voice/ar/'))).toBe(true);
    expect(await h.engine.warm('ar')).toBe(3);
    expect(h.fetched).toHaveLength(3);
  });

  it('does nothing when no pack is shipped', async () => {
    expect(await harness().engine.warm('ar')).toBe(0);
  });

  it('stops quietly when a download fails, and does not throw', async () => {
    const texts = ['امش سيدا', 'مسافة', 'متر', 'لف يمين'];
    let calls = 0;
    const engine = new VoiceEngine({
      audio: { decode: async () => null, play: async () => ({ stop: () => undefined }) },
      fetchBytes: async () => {
        calls += 1;
        if (calls > 1) throw new Error('offline');
        return bytes('x');
      },
      fetchJson: async () => ({
        version: 1,
        locale: 'ar',
        clips: texts.map((text) => ({
          key: normalizeSpeech(text),
          text,
          file: `${atomId(normalizeSpeech(text))}.wav`,
          ms: 400,
        })),
      }),
      packUrl: (locale: Locale, file: string) => `/voice/${locale}/${file}`,
    });
    expect(await engine.warm('ar', 1)).toBe(1);
    expect(calls).toBe(2);
  });
});

describe('VoiceEngine: speaking', () => {
  it('plays the clips of a covered sentence in order', async () => {
    const h = harness(shippedFor('امش سيدا', 'مسافة', '35 متر'));
    await h.engine.load('ar');
    expect(h.engine.canSpeak('امشِ سيدا. مسافة 35 متر.', 'ar')).toBe(true);
    expect(await h.engine.speak('امشِ سيدا. مسافة 35 متر.', 'ar')).toBe(true);
    expect(h.played).toHaveLength(1);
    expect(h.played[0]!.buffers).toEqual(['shipped:امش سيدا', 'shipped:مسافة', 'shipped:35 متر']);
    expect(h.engine.getSnapshot().speaking).toBe(true);
    h.finish();
    expect(h.engine.getSnapshot().speaking).toBe(false);
  });

  it('falls back (returns false) when one word is missing, and plays nothing', async () => {
    const h = harness(shippedFor('امش سيدا'));
    await h.engine.load('ar');
    expect(h.engine.canSpeak('امش سيدا. مسافة 35 متر.', 'ar')).toBe(false);
    expect(await h.engine.speak('امش سيدا. مسافة 35 متر.', 'ar')).toBe(false);
    expect(h.played).toHaveLength(0);
    expect(h.engine.getSnapshot().speaking).toBe(false);
  });

  it('maps the speech speed onto the clips', async () => {
    const h = harness(shippedFor('مسافة'));
    await h.engine.load('ar');
    await h.engine.speak('مسافة', 'ar', 'slow');
    await h.engine.speak('مسافة', 'ar', 'fast');
    expect(h.played[0]!.rate).toBeLessThan(1);
    expect(h.played[1]!.rate).toBeGreaterThan(1);
  });

  it('fetches a shipped clip once, then reuses it', async () => {
    const h = harness(shippedFor('مسافة'));
    await h.engine.load('ar');
    await h.engine.speak('مسافة', 'ar');
    await h.engine.speak('مسافة', 'ar');
    expect(h.fetched).toHaveLength(1);
    expect(h.played[1]!.buffers).toEqual(['shipped:مسافة']);
  });

  it('falls back when a clip cannot be fetched or decoded, and can try again later', async () => {
    const h = harness(shippedFor('مسافة'));
    await h.engine.load('ar');
    h.failDecode(true);
    expect(await h.engine.speak('مسافة', 'ar')).toBe(false);
    expect(h.engine.getSnapshot().speaking).toBe(false);
    h.failDecode(false);
    expect(await h.engine.speak('مسافة', 'ar')).toBe(true);
  });

  it('lets a newer sentence take over from an older one', async () => {
    const h = harness(shippedFor('مسافة', 'المصاعد'));
    await h.engine.load('ar');
    await h.engine.speak('مسافة', 'ar');
    await h.engine.speak('المصاعد', 'ar');
    expect(h.stopped).toEqual([1]);
    expect(h.played[1]!.buffers).toEqual(['shipped:المصاعد']);
  });

  it('stops when cancelled', async () => {
    const h = harness(shippedFor('مسافة'));
    await h.engine.load('ar');
    await h.engine.speak('مسافة', 'ar');
    h.engine.cancel();
    expect(h.stopped).toEqual([1]);
    expect(h.engine.getSnapshot().speaking).toBe(false);
  });
});

describe('VoiceEngine: knowing when the pack is ready', () => {
  it('reports loaded only after the pack has been read', async () => {
    const h = harness(shippedFor('مسافة'));
    expect(h.engine.loaded('ar')).toBe(false);
    await h.engine.ready('ar');
    expect(h.engine.loaded('ar')).toBe(true);
    expect(h.engine.loaded('en')).toBe(false);
  });

  it('stops waiting after the time limit when the pack is slow, without giving up on it', async () => {
    let release: () => void = () => undefined;
    const slow = new VoiceEngine({
      audio: { decode: async () => null, play: async () => ({ stop: () => undefined }) },
      fetchBytes: async () => bytes('x'),
      fetchJson: () =>
        new Promise((resolve) => {
          release = () => resolve({ version: 1, locale: 'ar', clips: [] });
        }),
      packUrl: (locale: Locale, file: string) => `/voice/${locale}/${file}`,
    });
    await slow.ready('ar', 5); // gives up waiting…
    expect(slow.loaded('ar')).toBe(false);
    release(); // …but the load itself carries on
    await slow.load('ar');
    expect(slow.loaded('ar')).toBe(true);
  });
});
