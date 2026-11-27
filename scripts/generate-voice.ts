/**
 * Reads every phrase Darbak can say with a neural voice and writes the clips the
 * site ships. Each phrase is read with its vowel marks and its numbers spelled
 * out (src/voice/tashkeel.ts).
 *
 * With an open model on this machine (no key, nothing leaves the computer):
 *
 *   pip install "sherpa-onnx<2" numpy
 *   npm run voice:generate -- --engine piper --model path/to/vits-piper-ar_JO-kareem-medium
 *
 * With a Saudi neural voice from Azure AI Speech:
 *
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=… npm run voice:generate -- [options]
 *
 *   --engine azure|piper  where the voice comes from (default azure)
 *   --model DIR         piper: the model folder from the sherpa-onnx "tts-models" release
 *   --python CMD        piper: the Python to run (default python3)
 *   --locale ar|en      language of the pack (default ar)
 *   --voice NAME        azure: default ar-SA-HamedNeural; ar-SA-ZariyahNeural is the female voice
 *   --rate -5%          azure: speak a little slower (or +5% faster)
 *   --limit N           only the first N phrases: a cheap listening test
 *   --force             read everything again even if a clip exists
 *   --dry-run           print how many phrases and characters it would send, and stop
 *   --listen DIR        also write DIR/index.html with a play button per clip, to hear a trial
 *   --public DIR        where public/ is (default ./public)
 *
 * The GitHub workflow "Generate Saudi voice" runs this with the key kept as a
 * repository secret, so the key never has to be typed anywhere else.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Locale } from '../src/domain/types';
import { piperSource } from './piperSource';
import { DEFAULT_VOICE, azureSource, estimate, generatePack, listenPage } from './voicePack';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const locale = (option('locale') ?? 'ar') as Locale;
if (locale !== 'ar' && locale !== 'en') {
  console.error('--locale must be ar or en');
  process.exit(2);
}
const limit = option('limit') ? Number(option('limit')) : undefined;
if (limit !== undefined && !(limit > 0)) {
  console.error('--limit must be a positive number');
  process.exit(2);
}

const engine = option('engine') ?? 'azure';
if (engine !== 'azure' && engine !== 'piper') {
  console.error('--engine must be azure or piper');
  process.exit(2);
}

const plan = estimate(locale, limit);
const FREE_MONTH = 500_000;
console.log(
  `${plan.clips} phrases, ${plan.characters.toLocaleString('en')} characters` +
    (engine === 'azure'
      ? ` (${((plan.characters / FREE_MONTH) * 100).toFixed(1)}% of the free monthly allowance of 0.5 million).`
      : '.'),
);
if (flag('dry-run')) process.exit(0);

let closeSource = () => {};
try {
  let source;
  if (engine === 'piper') {
    const modelDir = option('model');
    if (!modelDir) {
      console.error(
        'Give the model folder: --model path/to/vits-piper-ar_JO-kareem-medium\n' +
          'Download one from https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models and unpack it.',
      );
      process.exit(2);
    }
    const python = option('python');
    const piper = await piperSource({ modelDir: resolve(modelDir), ...(python ? { python } : {}) });
    closeSource = () => piper.close();
    source = piper;
  } else {
    const key = process.env.AZURE_SPEECH_KEY ?? '';
    const region = process.env.AZURE_SPEECH_REGION ?? '';
    if (!key || !region) {
      console.error(
        'Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (from the Speech resource in the Azure portal: Keys and Endpoint).',
      );
      process.exit(2);
    }
    const rate = option('rate');
    source = azureSource({
      key,
      region,
      voice: option('voice') ?? DEFAULT_VOICE[locale],
      ...(rate ? { rate } : {}),
    });
  }
  const report = await generatePack({
    locale,
    publicDir: resolve(option('public') ?? 'public'),
    source,
    ...(limit ? { limit } : {}),
    force: flag('force'),
    log: console.log,
  });
  const listenDir = option('listen');
  if (listenDir) {
    const folder = join(resolve(option('public') ?? 'public'), 'voice', locale);
    const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as {
      clips: { text: string; file: string }[];
    };
    await mkdir(listenDir, { recursive: true });
    for (const clip of manifest.clips)
      await copyFile(join(folder, clip.file), join(listenDir, clip.file));
    await writeFile(
      join(listenDir, 'index.html'),
      listenPage(manifest.clips, report.voice, locale === 'ar' ? 'rtl' : 'ltr'),
    );
    console.log(`Listening page: ${join(listenDir, 'index.html')}`);
  }
  const mb = (report.bytes / 1_048_576).toFixed(1);
  console.log(
    `\nDone: ${report.generated} new clips (${mb} MB), ${report.reused} kept, ${report.failed.length} failed.`,
  );
  console.log(`Characters read: ${report.characters.toLocaleString('en')}`);
  console.log(`Phrases covered: ${report.atomsDone} of ${report.atomsTotal}`);
  console.log(
    `Routes spoken entirely in this voice: ${report.routesFull} of ${report.routesTotal}` +
      ` (${Math.floor((report.routesFull / Math.max(1, report.routesTotal)) * 100)}%)`,
  );
  if (report.failed.length > 0) {
    console.warn('\nFailed (they stay with the device voice; run again to retry):');
    report.failed.forEach((line) => console.warn(`  - ${line}`));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  closeSource();
  process.exit(1);
}
closeSource();
