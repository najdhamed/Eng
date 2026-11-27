import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCatalogue } from '../src/voice/catalogue';
import { speechText } from '../src/voice/tashkeel';
import { atomId } from '../src/voice/text';
import { encodeWav } from '../src/voice/wav';
import {
  DEFAULT_VOICE,
  assertConfig,
  buildSsml,
  FatalVoiceError,
  estimate,
  generatePack,
  listenPage,
  synthesize,
  type AzureConfig,
  type VoiceSource,
} from './voicePack';

const config: AzureConfig = {
  key: 'secret-key',
  region: 'saudiarabiaeast',
  voice: DEFAULT_VOICE.ar,
};

/** A fake Azure: a quiet tone with a little silence either side, as a real voice would give. */
const tone = (ms = 300, rate = 16_000) => {
  const pad = Math.round(rate * 0.15);
  const body = Math.round((rate * ms) / 1000);
  const samples = new Float32Array(pad + body + pad);
  for (let i = 0; i < body; i += 1) samples[pad + i] = Math.sin(i / 9) * 0.3;
  return encodeWav(samples, rate);
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function fakeAzure(respond: (call: Call, n: number) => Response | Promise<Response> = () => ok()) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const call = {
      url,
      headers: init.headers as Record<string, string>,
      body: String(init.body),
    };
    calls.push(call);
    return respond(call, calls.length);
  };
  return { calls, fetchImpl };
}
const ok = (data: Uint8Array = tone()) => new Response(data as BlobPart, { status: 200 });
const status = (code: number, headers: Record<string, string> = {}) =>
  new Response('no', { status: code, headers });
const noSleep = async () => undefined;

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'darbak-voice-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SSML', () => {
  it('names the voice, takes the language from it, and escapes the text', () => {
    const ssml = buildSsml('لف يمين & <انتبه>', { voice: 'ar-SA-ZariyahNeural' });
    expect(ssml).toContain('xml:lang="ar-SA"');
    expect(ssml).toContain('<voice name="ar-SA-ZariyahNeural">');
    expect(ssml).toContain('لف يمين &amp; &lt;انتبه&gt;');
    expect(ssml).not.toContain('<prosody');
  });

  it('adds a speaking rate only when asked', () => {
    expect(buildSsml('x', { voice: DEFAULT_VOICE.ar, rate: '-5%' })).toContain(
      '<prosody rate="-5%">x</prosody>',
    );
  });

  it('refuses a voice name or rate that could carry markup', () => {
    expect(() => buildSsml('x', { voice: 'ar-SA"><x/>' })).toThrow(/voice name/);
    expect(() => buildSsml('x', { voice: DEFAULT_VOICE.ar, rate: '5"/>' })).toThrow(/rate/);
    expect(() => assertConfig({ ...config, region: 'a.b/c' })).toThrow(/region/);
    expect(() => assertConfig({ ...config, key: '' })).toThrow(/KEY/);
  });
});

describe('asking Azure', () => {
  it('posts the SSML to the region with the key and asks for a 16 kHz mono WAV', async () => {
    const azure = fakeAzure();
    const wav = await synthesize('مسافة', config, { fetchImpl: azure.fetchImpl });
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    const [call] = azure.calls;
    expect(call!.url).toBe('https://saudiarabiaeast.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(call!.headers['Ocp-Apim-Subscription-Key']).toBe('secret-key');
    expect(call!.headers['X-Microsoft-OutputFormat']).toBe('riff-16khz-16bit-mono-pcm');
    expect(call!.headers['Content-Type']).toBe('application/ssml+xml');
    expect(call!.body).toContain('مسافة');
  });

  it('waits and retries when Azure is busy, honouring Retry-After', async () => {
    const waits: number[] = [];
    const azure = fakeAzure((_, n) => (n < 3 ? status(429, { 'retry-after': '2' }) : ok()));
    await synthesize('x', config, {
      fetchImpl: azure.fetchImpl,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(azure.calls).toHaveLength(3);
    expect(waits).toEqual([2000, 2000]);
  });

  it('gives up after the retries, and says which phrase', async () => {
    const azure = fakeAzure(() => status(503));
    await expect(
      synthesize('مسافة', config, { fetchImpl: azure.fetchImpl, sleep: noSleep, retries: 2 }),
    ).rejects.toThrow(/503.*مسافة/);
    expect(azure.calls).toHaveLength(3);
  });

  it('retries a dropped connection, then says it could not reach Azure', async () => {
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n < 3) throw new TypeError('fetch failed');
      return ok();
    };
    await synthesize('x', config, { fetchImpl: flaky, sleep: noSleep });
    expect(n).toBe(3);
    const down = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      synthesize('x', config, { fetchImpl: down, sleep: noSleep, retries: 1 }),
    ).rejects.toThrow(/Could not reach Azure/);
  });

  it('explains a refused key instead of retrying', async () => {
    const azure = fakeAzure(() => status(401));
    await expect(
      synthesize('x', config, { fetchImpl: azure.fetchImpl, sleep: noSleep }),
    ).rejects.toThrow(/refused the key.*AZURE_SPEECH_REGION/);
    expect(azure.calls).toHaveLength(1);
  });

  it('never prints the key in an error', async () => {
    const azure = fakeAzure(() => status(400));
    const error = await synthesize('x', config, { fetchImpl: azure.fetchImpl }).catch((e) => e);
    expect(String(error)).not.toContain('secret-key');
  });
});

describe('making the pack', () => {
  const run = (extra: Partial<Parameters<typeof generatePack>[0]> = {}, azure = fakeAzure()) =>
    generatePack({
      locale: 'ar',
      publicDir: dir,
      config,
      synth: { fetchImpl: azure.fetchImpl, sleep: noSleep },
      ...extra,
    }).then((report) => ({ report, azure }));

  const folder = () => join(dir, 'voice', 'ar');

  it('writes a trimmed clip per phrase and a manifest the site understands', async () => {
    const { report, azure } = await run({ limit: 5 });
    expect(azure.calls).toHaveLength(5);
    expect(report).toMatchObject({ generated: 5, reused: 0, failed: [], atomsDone: 5 });
    expect(report.characters).toBe(estimate('ar', 5).characters);

    const manifest = JSON.parse(await readFile(join(folder(), 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ version: 1, locale: 'ar', voice: DEFAULT_VOICE.ar });
    expect(manifest.clips).toHaveLength(5);
    const atoms = buildCatalogue('ar').atoms.slice(0, 5);
    expect(manifest.clips.map((c: { key: string }) => c.key)).toEqual(atoms.map((a) => a.key));
    for (const clip of manifest.clips) {
      expect(clip.file).toBe(`${atomId(clip.key)}.wav`);
      // The silence either side was cut: a 300 ms tone, not 600 ms.
      expect(clip.ms).toBeLessThan(450);
      expect(clip.ms).toBeGreaterThan(250);
      const wav = await readFile(join(folder(), clip.file));
      expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
    }
  });

  it('can say every route once every phrase is read', async () => {
    const { report, azure } = await run();
    const total = buildCatalogue('ar').atoms.length;
    expect(azure.calls).toHaveLength(total);
    expect(report.atomsDone).toBe(total);
    expect(report.routesFull).toBe(report.routesTotal);
    expect(report.failed).toEqual([]);
  });

  it('keeps what is already made, so an interrupted run can simply be run again', async () => {
    await run({ limit: 4 });
    const second = await run({ limit: 6 });
    expect(second.azure.calls).toHaveLength(2);
    expect(second.report).toMatchObject({ generated: 2, reused: 4 });
    const again = await run({ limit: 6 });
    expect(again.azure.calls).toHaveLength(0);
  });

  it('reads everything again with --force, or when the voice changes', async () => {
    await run({ limit: 3 });
    expect((await run({ limit: 3, force: true })).azure.calls).toHaveLength(3);
    const other = await run({
      limit: 3,
      config: { ...config, voice: 'ar-SA-ZariyahNeural' },
    });
    expect(other.azure.calls).toHaveLength(3);
    const manifest = JSON.parse(await readFile(join(folder(), 'manifest.json'), 'utf8'));
    expect(manifest.voice).toBe('ar-SA-ZariyahNeural');
  });

  it('leaves out a phrase that failed, reports it, and keeps going', async () => {
    const atoms = buildCatalogue('ar').atoms.slice(0, 4);
    const bad = atoms[1]!;
    const azure = fakeAzure((call) =>
      call.body.includes(speechText(bad.text, 'ar')) ? status(400) : ok(),
    );
    const { report } = await run({ limit: 4 }, azure);
    expect(report.generated).toBe(3);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toContain(bad.text);
    const manifest = JSON.parse(await readFile(join(folder(), 'manifest.json'), 'utf8'));
    expect(manifest.clips).toHaveLength(3);
  });

  it('treats silent audio as a failure', async () => {
    const silent = encodeWav(new Float32Array(16_000), 16_000);
    const azure = fakeAzure((_, n) => (n === 1 ? ok(silent) : ok()));
    const { report } = await run({ limit: 3, concurrency: 1 }, azure);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatch(/silent/);
  });

  it('stops at once when the key is refused, and writes nothing', async () => {
    const azure = fakeAzure(() => status(401));
    await expect(run({ limit: 10, concurrency: 1 }, azure)).rejects.toThrow(/refused the key/);
    expect(azure.calls).toHaveLength(1);
    expect(await readdir(folder())).toEqual([]);
  });

  it('removes clips an older run left behind', async () => {
    await run({ limit: 3 });
    await writeFile(join(folder(), 'stale.wav'), 'x');
    await run({ limit: 3 });
    expect((await readdir(folder())).includes('stale.wav')).toBe(false);
  });

  it('reads each phrase with its vowel marks and its numbers as words, but files it by the plain phrase', async () => {
    const heard: string[] = [];
    const source: VoiceSource = {
      name: 'test-voice',
      speak: async (text) => {
        heard.push(text);
        return tone();
      },
    };
    await generatePack({ locale: 'ar', publicDir: dir, source, concurrency: 1 });
    const atoms = buildCatalogue('ar').atoms;
    const plain = atoms.find((a) => a.text === '6 خطوات')!;
    expect(heard).toContain('سِتّ خُطُوَات');
    expect(heard).toContain('يَلَّا نَمْشِي');
    expect(heard.some((text) => /[0-9]/.test(text))).toBe(false);
    const manifest = JSON.parse(await readFile(join(folder(), 'manifest.json'), 'utf8'));
    expect(manifest.clips.find((c: { key: string }) => c.key === plain.key).text).toBe('6 خطوات');
  });

  it('sends Azure the marked text too', async () => {
    const { azure } = await run({ limit: 3 });
    expect(azure.calls.some((call) => call.body.includes('يَلَّا نَمْشِي'))).toBe(true);
  });

  it('takes any voice source, names its clips by it, and never reuses another voice', async () => {
    const make = (name: string): VoiceSource => ({ name, speak: async () => tone() });
    await generatePack({ locale: 'ar', publicDir: dir, source: make('voice-a'), limit: 3 });
    const manifest = () => readFile(join(folder(), 'manifest.json'), 'utf8').then(JSON.parse);
    expect((await manifest()).voice).toBe('voice-a');
    const other = await generatePack({
      locale: 'ar',
      publicDir: dir,
      source: make('voice-b'),
      limit: 3,
    });
    expect(other).toMatchObject({ generated: 3, reused: 0, voice: 'voice-b' });
  });

  it('stops at once on a fatal error from any voice, not only a refused Azure key', async () => {
    let asked = 0;
    const source: VoiceSource = {
      name: 'broken',
      speak: async () => {
        asked += 1;
        throw new FatalVoiceError('the model is missing');
      },
    };
    await expect(
      generatePack({ locale: 'ar', publicDir: dir, source, limit: 10, concurrency: 1 }),
    ).rejects.toThrow('the model is missing');
    expect(asked).toBe(1);
  });

  it('asks for a voice', async () => {
    await expect(generatePack({ locale: 'ar', publicDir: dir })).rejects.toThrow(/Give a voice/);
  });

  it('works for English too, with its own default voice', async () => {
    const azure = fakeAzure();
    const report = await generatePack({
      locale: 'en',
      publicDir: dir,
      config: { ...config, voice: DEFAULT_VOICE.en },
      limit: 2,
      synth: { fetchImpl: azure.fetchImpl, sleep: noSleep },
    });
    expect(report.generated).toBe(2);
    expect(azure.calls[0]!.body).toContain('xml:lang="en-GB"');
  });
});

describe('what it will cost', () => {
  it('reports the characters before anything is sent', () => {
    const all = estimate('ar');
    expect(all.clips).toBe(buildCatalogue('ar').atoms.length);
    // The whole Arabic pack is a small fraction of the free 0.5 million characters a month.
    expect(all.characters).toBeLessThan(25_000);
    expect(estimate('ar', 10).clips).toBe(10);
  });
});

describe('the listening page', () => {
  it('has a player and the written phrase for every clip, and escapes the text', () => {
    const html = listenPage(
      [
        { text: 'لف يمين', file: 'a.wav' },
        { text: '<b>x</b>', file: 'b.wav' },
      ],
      DEFAULT_VOICE.ar,
      'rtl',
    );
    expect(html).toContain('src="a.wav"');
    expect(html).toContain('<span>لف يمين</span>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('dir="rtl"');
  });
});
