import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCatalogue } from '../src/voice/catalogue';
import { atomId } from '../src/voice/text';
import { encodeWav } from '../src/voice/wav';
import { writeZip } from '../src/voice/zip';
import { installPack } from './voicePack';

const tone = (ms: number, rate = 16_000) =>
  encodeWav(
    Float32Array.from({ length: Math.round((rate * ms) / 1000) }, (_, i) => Math.sin(i / 9) * 0.4),
    rate,
  );

const catalogue = buildCatalogue('en');

function pack(
  count: number,
  mutate: (
    clips: Record<string, unknown>[],
    files: { name: string; data: Uint8Array }[],
  ) => void = () => undefined,
  locale: string | undefined = 'en',
) {
  const atoms = catalogue.atoms.slice(0, count);
  const clips: Record<string, unknown>[] = atoms.map((atom) => ({
    key: atom.key,
    text: atom.text,
    file: `${atomId(atom.key)}.wav`,
    ms: 300,
  }));
  const files = atoms.map((atom) => ({ name: `${atomId(atom.key)}.wav`, data: tone(300) }));
  mutate(clips, files);
  const manifest = new TextEncoder().encode(JSON.stringify({ version: 1, locale, clips }));
  return writeZip([{ name: 'manifest.json', data: manifest }, ...files]);
}

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'darbak-pack-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('installing a voice pack', () => {
  it('copies clips and a manifest into public/voice/<locale>, and reports coverage', async () => {
    const report = await installPack(pack(5), dir);
    expect(report).toMatchObject({ locale: 'en', installed: 5, atomsDone: 5, rejected: [] });
    expect(report.atomsTotal).toBe(catalogue.atoms.length);
    expect(report.missing.length).toBeGreaterThan(0);

    const folder = join(dir, 'voice', 'en');
    const names = (await readdir(folder)).sort();
    expect(names).toHaveLength(6); // five clips and the manifest
    const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
    expect(manifest.version).toBe(1);
    expect(manifest.clips).toHaveLength(5);
    for (const clip of manifest.clips) expect(names).toContain(clip.file);
  });

  it('can say every route once every phrase is recorded', async () => {
    const report = await installPack(pack(catalogue.atoms.length), dir);
    expect(report.atomsDone).toBe(report.atomsTotal);
    expect(report.routesFull).toBe(report.routesTotal);
    expect(report.missing).toEqual([]);
  });

  it('replaces an older pack instead of mixing with it', async () => {
    const folder = join(dir, 'voice', 'en');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'stale.wav'), 'old');
    await installPack(pack(2), dir);
    expect(await readdir(folder)).not.toContain('stale.wav');
  });

  it('leaves out clips that fail a check, and says why', async () => {
    const report = await installPack(
      pack(6, (clips, files) => {
        clips[0] = { ...clips[0], text: 'something else' }; // text no longer matches its key
        files.splice(1, 1); // the second clip's audio is missing
        files[1] = { ...files[1]!, data: tone(300, 44_100) }; // wrong sample rate
        files[2] = { ...files[2]!, data: tone(10) }; // far too short
        clips.push({ ...clips[5] }); // recorded twice
      }),
      dir,
    );
    expect(report.installed).toBe(2);
    expect(report.rejected).toHaveLength(5);
    expect(report.rejected.join('\n')).toMatch(/disagree/);
    expect(report.rejected.join('\n')).toMatch(/missing/);
    expect(report.rejected.join('\n')).toMatch(/sample rate/);
    expect(report.rejected.join('\n')).toMatch(/shorter/);
    expect(report.rejected.join('\n')).toMatch(/twice/);
  });

  it('writes nothing when the pack is unusable', async () => {
    await expect(installPack(new Uint8Array([1, 2, 3, 4]), dir)).rejects.toThrow(/zip/i);
    await expect(
      installPack(writeZip([{ name: 'a.txt', data: new Uint8Array(1) }]), dir),
    ).rejects.toThrow(/manifest/);
    await expect(
      installPack(
        pack(2, () => undefined, 'xx'),
        dir,
      ),
    ).rejects.toThrow(/Arabic or English/);
    await expect(installPack(pack(0), dir)).rejects.toThrow(/No usable clips/);
    expect(await readdir(dir)).toEqual([]);
  });
});
