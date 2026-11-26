import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locale } from '../src/domain/types';
import { buildCatalogue, coverage, type Atom } from '../src/voice/catalogue';
import { atomId } from '../src/voice/text';
import { decodeWav, processRecording } from '../src/voice/wav';

/**
 * Makes the voice the site ships: every phrase the app can say (the catalogue)
 * is read once by a neural voice from Azure AI Speech, cleaned up so the clips
 * stitch together, and written to public/voice/<locale>/ with a manifest. It
 * runs on a developer's machine or in a GitHub workflow, never in the browser,
 * so the key stays secret and visitors only download static files.
 */

export interface AzureConfig {
  readonly key: string;
  readonly region: string;
  /** For example ar-SA-HamedNeural (male) or ar-SA-ZariyahNeural (female). */
  readonly voice: string;
  /** Speaking-rate offset such as "-5%" (slower) or "+5%"; omit for the voice's own pace. */
  readonly rate?: string;
}

export const DEFAULT_VOICE: Record<Locale, string> = {
  ar: 'ar-SA-HamedNeural',
  en: 'en-GB-SoniaNeural',
};

const VOICE_NAME = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+$/;
const RATE = /^[+-]?\d{1,2}%$/;
const REGION = /^[a-z0-9]{3,30}$/;

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function assertConfig(config: AzureConfig): void {
  if (!config.key) throw new Error('AZURE_SPEECH_KEY is empty');
  if (!REGION.test(config.region))
    throw new Error(`"${config.region}" does not look like an Azure region (e.g. saudiarabiaeast)`);
  if (!VOICE_NAME.test(config.voice))
    throw new Error(`"${config.voice}" is not a voice name (e.g. ar-SA-HamedNeural)`);
  if (config.rate !== undefined && !RATE.test(config.rate))
    throw new Error(`"${config.rate}" is not a rate such as -5% or +5%`);
}

/** The SSML for one phrase: the voice's own language is taken from its name. */
export function buildSsml(text: string, config: Pick<AzureConfig, 'voice' | 'rate'>): string {
  if (!VOICE_NAME.test(config.voice)) throw new Error(`"${config.voice}" is not a voice name`);
  if (config.rate !== undefined && !RATE.test(config.rate))
    throw new Error(`"${config.rate}" is not a rate such as -5% or +5%`);
  const lang = config.voice.split('-').slice(0, 2).join('-');
  const body = escapeXml(text);
  const spoken = config.rate ? `<prosody rate="${config.rate}">${body}</prosody>` : body;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${config.voice}">${spoken}</voice></speak>`
  );
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SynthOptions {
  readonly fetchImpl?: Fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly retries?: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One phrase to a 16 kHz mono WAV. Busy signals are retried; a refused key is explained. */
export async function synthesize(
  text: string,
  config: AzureConfig,
  { fetchImpl = fetch, sleep = wait, retries = 4 }: SynthOptions = {},
): Promise<Uint8Array> {
  assertConfig(config);
  const url = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm',
      'User-Agent': 'darbak-voice-generator',
    },
    body: buildSsml(text, config),
  };
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      // A dropped connection is retried like a busy signal.
      if (attempt >= retries) throw new Error(`Could not reach Azure: ${String(error)}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Azure refused the key (HTTP ${response.status}). Check AZURE_SPEECH_KEY and that AZURE_SPEECH_REGION is the region of that Speech resource.`,
      );
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Azure answered HTTP ${response.status} for "${text}"`);
    }
    const asked = Number(response.headers.get('retry-after'));
    await sleep(asked > 0 ? asked * 1000 : 500 * 2 ** attempt);
  }
}

export interface GenerateOptions {
  readonly locale: Locale;
  readonly publicDir: string;
  readonly config: AzureConfig;
  /** Only the first N phrases: a cheap listening test. */
  readonly limit?: number;
  /** Read every phrase again even if its clip is already there. */
  readonly force?: boolean;
  readonly concurrency?: number;
  readonly synth?: SynthOptions;
  readonly log?: (line: string) => void;
}

export interface GenerateReport {
  readonly locale: Locale;
  readonly voice: string;
  readonly generated: number;
  readonly reused: number;
  readonly failed: readonly string[];
  /** Characters of text sent to Azure (what the free allowance is counted in). */
  readonly characters: number;
  readonly bytes: number;
  readonly atomsDone: number;
  readonly atomsTotal: number;
  readonly routesFull: number;
  readonly routesTotal: number;
}

interface ManifestFile {
  version?: number;
  voice?: string;
  clips?: { key?: string; text?: string; file?: string; ms?: number }[];
}

interface Clip {
  readonly key: string;
  readonly text: string;
  readonly file: string;
  readonly ms: number;
}

async function readManifest(folder: string): Promise<ManifestFile | null> {
  try {
    return JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as ManifestFile;
  } catch {
    return null;
  }
}

/** What reading the whole catalogue would cost, without calling Azure. */
export function estimate(locale: Locale, limit?: number) {
  const atoms = buildCatalogue(locale).atoms.slice(0, limit);
  return {
    clips: atoms.length,
    characters: atoms.reduce((sum, atom) => sum + atom.text.length, 0),
  };
}

export async function generatePack(options: GenerateOptions): Promise<GenerateReport> {
  const { locale, publicDir, config, limit, force = false, log = () => undefined } = options;
  assertConfig(config);
  const catalogue = buildCatalogue(locale);
  const atoms: readonly Atom[] = limit ? catalogue.atoms.slice(0, limit) : catalogue.atoms;
  const folder = join(publicDir, 'voice', locale);
  await mkdir(folder, { recursive: true });

  // Clips already made by this same voice are kept, so a failed run can simply be run again.
  const previous = force ? null : await readManifest(folder);
  const reusable = new Map<string, Clip>();
  if (previous?.version === 1 && previous.voice === config.voice && previous.clips) {
    for (const clip of previous.clips) {
      if (!clip.key || !clip.text || !clip.file || typeof clip.ms !== 'number') continue;
      try {
        await readFile(join(folder, clip.file));
        reusable.set(clip.key, { key: clip.key, text: clip.text, file: clip.file, ms: clip.ms });
      } catch {
        // The file is gone: make it again.
      }
    }
  }

  const made = new Map<string, Clip>();
  const failed: string[] = [];
  let characters = 0;
  let bytes = 0;
  const queue = atoms.filter((atom) => !reusable.has(atom.key));
  let finished = 0;

  const worker = async () => {
    for (let atom = queue.shift(); atom; atom = queue.shift()) {
      try {
        const raw = await synthesize(atom.text, config, options.synth);
        characters += atom.text.length;
        const { samples, rate } = decodeWav(raw);
        const clip = processRecording(samples, rate);
        if (clip.silent) throw new Error('the audio is silent');
        const file = `${atomId(atom.key)}.wav`;
        await writeFile(join(folder, file), clip.wav);
        bytes += clip.wav.length;
        made.set(atom.key, { key: atom.key, text: atom.text, file, ms: clip.ms });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A refused key will fail every phrase the same way: stop at once.
        if (message.startsWith('Azure refused')) throw error;
        failed.push(`${atom.text}: ${message}`);
      }
      finished += 1;
      if (finished % 20 === 0 || queue.length === 0)
        log(`  ${finished} of ${finished + queue.length}`);
    }
  };
  const total = queue.length;
  log(`Reading ${total} phrases with ${config.voice} (${atoms.length - total} already done)…`);
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));

  const clips: Clip[] = [];
  for (const atom of atoms) {
    const clip = made.get(atom.key) ?? reusable.get(atom.key);
    if (clip) clips.push(clip);
  }
  if (clips.length === 0) throw new Error(`No clip could be made. ${failed[0] ?? ''}`.trim());

  await writeFile(
    join(folder, 'manifest.json'),
    `${JSON.stringify({ version: 1, locale, voice: config.voice, clips }, null, 1)}\n`,
  );
  // Clips of an older run that the manifest no longer lists are removed.
  const keep = new Set(clips.map((clip) => clip.file));
  for (const name of await readdir(folder)) {
    if (name.endsWith('.wav') && !keep.has(name)) await rm(join(folder, name));
  }

  const stats = coverage(catalogue, new Set(clips.map((clip) => clip.key)));
  return {
    locale,
    voice: config.voice,
    generated: made.size,
    reused: reusable.size,
    failed,
    characters,
    bytes,
    ...stats,
  };
}

/** A page with a play button per clip, for listening to a trial run before it is shipped. */
export function listenPage(
  clips: readonly { text: string; file: string }[],
  voice: string,
  dir: 'rtl' | 'ltr',
): string {
  const rows = clips
    .map(
      (clip) =>
        `<li><audio controls preload="none" src="${escapeXml(clip.file)}"></audio><span>${escapeXml(clip.text)}</span></li>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Darbak voice test</title>
<style>body{font:18px system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 16px}
li{display:flex;gap:14px;align-items:center;margin:12px 0}span{font-size:1.3em}audio{flex:none;max-width:55%}
ol{padding:0;list-style:none}</style></head>
<body><h1>Darbak voice test: ${escapeXml(voice)}</h1>
<ol dir="${dir}">
${rows}
</ol></body></html>
`;
}
