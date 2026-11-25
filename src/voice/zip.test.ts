import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, readZip, writeZip } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zip', () => {
  it('round-trips files, including empty, binary and Arabic names', async () => {
    const binary = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
    const files = [
      { name: 'manifest.json', data: bytes('{"version":1}') },
      { name: 'clips/خمسة.wav', data: binary },
      { name: 'empty.txt', data: new Uint8Array() },
    ];
    const read = await readZip(writeZip(files));
    expect(read.map((f) => f.name)).toEqual(files.map((f) => f.name));
    read.forEach((file, i) => expect(Array.from(file.data)).toEqual(Array.from(files[i]!.data)));
  });

  it('writes an empty archive that reads back empty', async () => {
    expect(await readZip(writeZip([]))).toEqual([]);
  });

  it('reads a zip whose files were deflated by another tool', async () => {
    const original = bytes('hello hello hello hello hello hello'.repeat(20));
    const packed = deflateRawSync(original);
    const stored = writeZip([{ name: 'a.txt', data: original }]);
    // Rewrite the stored entry as a deflated one (method 8, compressed size, same crc).
    const view = new DataView(stored.buffer.slice(0));
    const nameLength = 5;
    const local = new Uint8Array(30 + nameLength + packed.length);
    local.set(stored.subarray(0, 30 + nameLength));
    local.set(packed, 30 + nameLength);
    const lv = new DataView(local.buffer);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, packed.length, true);
    const centralStart = 30 + nameLength + original.length;
    const centralPart = stored.slice(centralStart);
    const cv = new DataView(centralPart.buffer);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(centralPart.length - 22 + 16, local.length, true);
    const zipped = new Uint8Array(local.length + centralPart.length);
    zipped.set(local);
    zipped.set(centralPart, local.length);
    expect(view.byteLength).toBeGreaterThan(0);

    const [file] = await readZip(zipped);
    expect(file!.name).toBe('a.txt');
    expect(Array.from(file!.data)).toEqual(Array.from(original));
  });

  it('rejects things that are not zips, and files that were damaged', async () => {
    await expect(readZip(bytes('not a zip at all, just words'))).rejects.toThrow('Not a zip');
    const zipped = writeZip([{ name: 'a.txt', data: bytes('some content here') }]);
    zipped[30 + 5 + 3] = zipped[30 + 5 + 3]! ^ 0xff; // flip a byte in the stored data
    await expect(readZip(zipped)).rejects.toThrow('Damaged');
  });
});
