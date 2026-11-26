/**
 * Turns a raw microphone take into a clip that stitches cleanly: silence cut
 * from both ends, a short fade so there is no click, an even loudness, and a
 * small mono 16 kHz WAV that every browser can play (a MediaRecorder file would
 * differ between an iPhone and an Android phone).
 */

export const CLIP_RATE = 16_000;

export interface ProcessedClip {
  readonly wav: Uint8Array;
  readonly ms: number;
  /** True when nothing louder than the room was heard. */
  readonly silent: boolean;
}

/** Keeps the part between the first and last sound, with a little air on each side. */
export function trimSilence(
  samples: Float32Array,
  rate: number,
  options: { thresholdDb?: number; padMs?: number } = {},
): Float32Array {
  const threshold = 10 ** ((options.thresholdDb ?? -40) / 20);
  const pad = Math.round(((options.padMs ?? 45) / 1000) * rate);
  // Judge loudness over 10 ms windows so one stray sample is not "sound".
  const window = Math.max(1, Math.round(rate / 100));
  const loud = (from: number) => {
    let sum = 0;
    const to = Math.min(samples.length, from + window);
    for (let i = from; i < to; i += 1) sum += samples[i]! * samples[i]!;
    return Math.sqrt(sum / Math.max(1, to - from)) > threshold;
  };

  let start = 0;
  while (start < samples.length && !loud(start)) start += window;
  if (start >= samples.length) return new Float32Array();
  let end = samples.length - 1;
  while (end > start && !loud(Math.max(0, end - window))) end -= window;

  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

/** Averages groups of samples when shrinking, and interpolates when growing. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || samples.length === 0) return samples.slice();
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(length);
  const ratio = from / to;
  for (let i = 0; i < length; i += 1) {
    const a = i * ratio;
    const b = Math.min(samples.length, (i + 1) * ratio);
    if (ratio > 1) {
      let sum = 0;
      let n = 0;
      for (let j = Math.floor(a); j < Math.ceil(b); j += 1) {
        sum += samples[j]!;
        n += 1;
      }
      out[i] = n ? sum / n : 0;
    } else {
      const j = Math.floor(a);
      const t = a - j;
      const next = samples[Math.min(samples.length - 1, j + 1)]!;
      out[i] = samples[j]! * (1 - t) + next * t;
    }
  }
  return out;
}

export function fade(samples: Float32Array, rate: number, ms = 8): Float32Array {
  const out = samples.slice();
  const n = Math.min(Math.floor(out.length / 2), Math.round((ms / 1000) * rate));
  for (let i = 0; i < n; i += 1) {
    const gain = i / n;
    out[i] = out[i]! * gain;
    out[out.length - 1 - i] = out[out.length - 1 - i]! * gain;
  }
  return out;
}

/** Scales so the loudest sample sits at `peak`, so clips recorded at different levels match. */
export function normalizePeak(samples: Float32Array, peak = 0.85): Float32Array {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max < 1e-4) return samples.slice();
  const gain = peak / max;
  return samples.map((sample) => sample * gain);
}

export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 0x8000 : 0x7fff)), true);
  });
  return bytes;
}

export function decodeWav(bytes: Uint8Array): { samples: Float32Array; rate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  const rate = view.getUint32(24, true);
  const count = view.getUint32(40, true) / 2;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const value = view.getInt16(44 + i * 2, true);
    samples[i] = value < 0 ? value / 0x8000 : value / 0x7fff;
  }
  return { samples, rate };
}

/** The whole clean-up, from the microphone's samples to a stored clip. */
export function processRecording(samples: Float32Array, rate: number): ProcessedClip {
  const trimmed = trimSilence(samples, rate);
  if (trimmed.length === 0)
    return { wav: encodeWav(new Float32Array(), CLIP_RATE), ms: 0, silent: true };
  const clip = normalizePeak(fade(resample(trimmed, rate, CLIP_RATE), CLIP_RATE));
  return {
    wav: encodeWav(clip, CLIP_RATE),
    ms: Math.round((clip.length / CLIP_RATE) * 1000),
    silent: false,
  };
}
