import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locale } from '../src/domain/types';
import { buildCatalogue, coverage } from '../src/voice/catalogue';
import { atomId, normalizeSpeech } from '../src/voice/text';
import { CLIP_RATE, decodeWav } from '../src/voice/wav';
import { readZip } from '../src/voice/zip';

export interface InstallReport {
  readonly locale: Locale;
  readonly installed: number;
  readonly rejected: readonly string[];
  readonly atomsDone: number;
  readonly atomsTotal: number;
  readonly routesFull: number;
  readonly routesTotal: number;
  /** The first few phrases still to record. */
  readonly missing: readonly string[];
  readonly bytes: number;
}

interface Manifest {
  version?: number;
  locale?: string;
  clips?: { key?: string; text?: string; file?: string; ms?: number }[];
}

const isLocale = (value: unknown): value is Locale => value === 'ar' || value === 'en';

/**
 * Checks a pack exported from the Voice Studio and installs it as the pack the
 * site ships (public/voice/<locale>/). Nothing is written if the pack is not
 * usable. Clips that fail a check are left out and listed in the report.
 */
export async function installPack(zip: Uint8Array, publicDir: string): Promise<InstallReport> {
  const files = await readZip(zip);
  const byName = new Map(files.map((file) => [file.name.replace(/^.*\//, ''), file.data]));
  const manifestBytes = byName.get('manifest.json');
  if (!manifestBytes)
    throw new Error(
      'This zip has no manifest.json. Use the file saved by the Voice Studio as it is.',
    );

  let manifest: Manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
  } catch {
    throw new Error('manifest.json is not valid JSON');
  }
  if (manifest.version !== 1 || !Array.isArray(manifest.clips)) {
    throw new Error('Unknown voice pack format (expected version 1)');
  }
  if (!isLocale(manifest.locale))
    throw new Error('The pack does not say whether it is Arabic or English');
  const locale = manifest.locale;

  const accepted: { key: string; text: string; file: string; ms: number; wav: Uint8Array }[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const clip of manifest.clips) {
    const label = clip.text ?? clip.key ?? '(unnamed clip)';
    if (
      typeof clip.key !== 'string' ||
      typeof clip.text !== 'string' ||
      typeof clip.file !== 'string'
    ) {
      rejected.push(`${label}: incomplete entry`);
      continue;
    }
    if (normalizeSpeech(clip.text) !== clip.key) {
      rejected.push(`${label}: its text and key disagree`);
      continue;
    }
    if (seen.has(clip.key)) {
      rejected.push(`${label}: recorded twice`);
      continue;
    }
    const wav = byName.get(clip.file.replace(/^.*\//, ''));
    if (!wav) {
      rejected.push(`${label}: the audio file ${clip.file} is missing`);
      continue;
    }
    try {
      const { samples, rate } = decodeWav(wav);
      if (rate !== CLIP_RATE) throw new Error(`sample rate is ${rate}, not ${CLIP_RATE}`);
      if (samples.length < CLIP_RATE * 0.05) throw new Error('shorter than 50 ms');
      if (samples.length > CLIP_RATE * 8) throw new Error('longer than 8 s');
    } catch (error) {
      rejected.push(`${label}: ${error instanceof Error ? error.message : 'unreadable audio'}`);
      continue;
    }
    seen.add(clip.key);
    accepted.push({
      key: clip.key,
      text: clip.text,
      file: `${atomId(clip.key)}.wav`,
      ms: Math.round(((wav.length - 44) / 2 / CLIP_RATE) * 1000),
      wav,
    });
  }
  if (accepted.length === 0) throw new Error('No usable clips in this pack');

  const target = join(publicDir, 'voice', locale);
  await mkdir(target, { recursive: true });
  for (const name of await readdir(target)) {
    if (name.endsWith('.wav') || name === 'manifest.json') await rm(join(target, name));
  }
  for (const clip of accepted) await writeFile(join(target, clip.file), clip.wav);
  await writeFile(
    join(target, 'manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        locale,
        clips: accepted.map(({ key, text, file, ms }) => ({ key, text, file, ms })),
      },
      null,
      1,
    )}\n`,
  );

  const catalogue = buildCatalogue(locale);
  const stats = coverage(catalogue, seen);
  return {
    locale,
    installed: accepted.length,
    rejected,
    ...stats,
    missing: catalogue.atoms
      .filter((atom) => !seen.has(atom.key))
      .slice(0, 12)
      .map((atom) => atom.text),
    bytes: accepted.reduce((sum, clip) => sum + clip.wav.length, 0),
  };
}
