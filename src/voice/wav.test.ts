import { describe, expect, it } from 'vitest';
import {
  CLIP_RATE,
  decodeWav,
  encodeWav,
  fade,
  normalizePeak,
  processRecording,
  resample,
  trimSilence,
} from './wav';

const RATE = 48_000;
const tone = (ms: number, hz = 220, amp = 0.5, rate = RATE) =>
  Float32Array.from(
    { length: Math.round((ms / 1000) * rate) },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate),
  );
const silence = (ms: number, rate = RATE) => new Float32Array(Math.round((ms / 1000) * rate));
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const ms = (samples: Float32Array, rate = RATE) => (samples.length / rate) * 1000;

describe('trimSilence', () => {
  it('cuts the dead air before and after the words, leaving a little padding', () => {
    const take = join(silence(700), tone(500), silence(900));
    const trimmed = trimSilence(take, RATE);
    expect(ms(trimmed)).toBeGreaterThan(500);
    expect(ms(trimmed)).toBeLessThan(500 + 2 * 45 + 30);
  });

  it('returns nothing for a take with no sound, and for quiet room noise', () => {
    expect(trimSilence(silence(1000), RATE).length).toBe(0);
    expect(trimSilence(tone(1000, 100, 0.002), RATE).length).toBe(0);
  });

  it('keeps a clip that has no silence to cut', () => {
    expect(ms(trimSilence(tone(400), RATE))).toBeCloseTo(400, -1);
  });
});

describe('resample', () => {
  it('shrinks to the clip rate and keeps the length in seconds', () => {
    const out = resample(tone(1000), RATE, CLIP_RATE);
    expect(out.length).toBe(CLIP_RATE);
  });

  it('leaves a tone a tone: the loudness survives down-sampling', () => {
    const out = resample(tone(500, 300, 0.6), RATE, CLIP_RATE);
    expect(Math.max(...out)).toBeGreaterThan(0.5);
  });

  it('grows too, and returns a copy at the same rate', () => {
    expect(resample(tone(100, 200, 0.5, 8000), 8000, 16000).length).toBe(1600);
    const same = tone(10);
    expect(resample(same, RATE, RATE)).not.toBe(same);
  });
});

describe('fade and normalizePeak', () => {
  it('starts and ends at silence, so stitched clips do not click', () => {
    const out = fade(tone(200, 200, 0.8), RATE);
    expect(Math.abs(out[0]!)).toBeLessThan(0.01);
    expect(Math.abs(out[out.length - 1]!)).toBeLessThan(0.05);
  });

  it('brings quiet and loud takes to the same peak', () => {
    const quiet = normalizePeak(tone(200, 220, 0.1));
    const loud = normalizePeak(tone(200, 220, 0.95));
    expect(Math.max(...quiet)).toBeCloseTo(0.85, 2);
    expect(Math.max(...loud)).toBeCloseTo(0.85, 2);
  });

  it('does not amplify silence into noise', () => {
    expect(Math.max(...normalizePeak(silence(100)))).toBe(0);
  });
});

describe('WAV encoding', () => {
  it('writes a valid mono 16-bit header and reads back what it wrote', () => {
    const samples = tone(100, 440, 0.7, CLIP_RATE);
    const wav = encodeWav(samples, CLIP_RATE);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(wav.length).toBe(44 + samples.length * 2);
    const back = decodeWav(wav);
    expect(back.rate).toBe(CLIP_RATE);
    expect(back.samples.length).toBe(samples.length);
    back.samples.forEach((value, i) => expect(Math.abs(value - samples[i]!)).toBeLessThan(1e-3));
  });

  it('clips samples outside the range instead of wrapping', () => {
    const back = decodeWav(encodeWav(Float32Array.of(2, -2, 0.5), CLIP_RATE));
    expect(back.samples[0]).toBeCloseTo(1, 3);
    expect(back.samples[1]).toBeCloseTo(-1, 3);
  });

  it('refuses something that is not a WAV file', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow('Not a WAV');
  });
});

describe('processRecording', () => {
  it('turns a raw take into a short, loud-enough clip', () => {
    const take = join(silence(800), tone(600, 250, 0.2), silence(1200));
    const clip = processRecording(take, RATE);
    expect(clip.silent).toBe(false);
    expect(clip.ms).toBeGreaterThan(600);
    expect(clip.ms).toBeLessThan(800);
    const { samples, rate } = decodeWav(clip.wav);
    expect(rate).toBe(CLIP_RATE);
    expect(Math.max(...samples)).toBeGreaterThan(0.8);
  });

  it('says so when nothing was recorded', () => {
    expect(processRecording(silence(2000), RATE)).toMatchObject({ silent: true, ms: 0 });
  });
});
