import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { piperSource, type Child } from './piperSource';
import { FatalVoiceError } from './voicePack';

/** A fake voice program: what the generator would see on its pipes. */
function fakeProgram(onRequest: (text: string, reply: (line: object) => void) => void) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const events = new EventEmitter();
  const reply = (line: object) => stdout.write(`${JSON.stringify(line)}\n`);
  let buffer = '';
  const requests: string[] = [];
  stdin.on('data', (chunk) => {
    buffer += String(chunk);
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const text = (JSON.parse(buffer.slice(0, at)) as { text: string }).text;
      buffer = buffer.slice(at + 1);
      requests.push(text);
      onRequest(text, reply);
    }
  });
  let killed = false;
  const child: Child = {
    stdin,
    stdout,
    stderr,
    on: ((event: string, listener: (...args: unknown[]) => void) =>
      events.on(event, listener)) as Child['on'],
    kill: () => {
      killed = true;
    },
  };
  return {
    child,
    reply,
    requests,
    stderr,
    exit: (code: number) => events.emit('exit', code),
    fail: (error: Error) => events.emit('error', error),
    killed: () => killed,
  };
}

const b64 = (text: string) => Buffer.from(text).toString('base64');

describe('piperSource', () => {
  it('waits for the model to be ready, then returns the audio for each phrase in order', async () => {
    const program = fakeProgram((text, reply) => reply({ wav: b64(`wav:${text}`) }));
    const starting = piperSource({ modelDir: '/models/kareem', start: () => program.child });
    program.reply({ ready: true, name: 'kareem', rate: 22050 });
    const source = await starting;
    expect(source.name).toBe('sherpa:kareem');

    const [a, b, c] = await Promise.all([source.speak('أ'), source.speak('ب'), source.speak('ج')]);
    expect(new TextDecoder().decode(a)).toBe('wav:أ');
    expect(new TextDecoder().decode(b)).toBe('wav:ب');
    expect(new TextDecoder().decode(c)).toBe('wav:ج');
    expect(program.requests).toEqual(['أ', 'ب', 'ج']);
  });

  it('asks for one phrase at a time, so answers cannot be mixed up', async () => {
    let open = 0;
    let most = 0;
    const program = fakeProgram((text, reply) => {
      open += 1;
      most = Math.max(most, open);
      setTimeout(() => {
        open -= 1;
        reply({ wav: b64(text) });
      }, 5);
    });
    const starting = piperSource({ modelDir: 'm', start: () => program.child });
    program.reply({ ready: true, name: 'm' });
    const source = await starting;
    await Promise.all(['1', '2', '3', '4'].map((t) => source.speak(t)));
    expect(most).toBe(1);
  });

  it('fails only the phrase the model could not read', async () => {
    const program = fakeProgram((text, reply) =>
      text === 'bad' ? reply({ error: 'no sound' }) : reply({ wav: b64(text) }),
    );
    const starting = piperSource({ modelDir: 'm', start: () => program.child });
    program.reply({ ready: true, name: 'm' });
    const source = await starting;
    await expect(source.speak('bad')).rejects.toThrow('no sound');
    await expect(source.speak('good')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('ignores lines that are not its own', async () => {
    const program = fakeProgram((text, reply) => {
      program.child.stdout.push('some library printing a banner\n');
      reply({ wav: b64(text) });
    });
    const starting = piperSource({ modelDir: 'm', start: () => program.child });
    program.child.stdout.push('loading…\n');
    program.reply({ ready: true, name: 'm' });
    await expect((await starting).speak('x')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('stops the whole run when the model cannot start, with the reason', async () => {
    const program = fakeProgram(() => undefined);
    const starting = piperSource({ modelDir: 'm', start: () => program.child });
    program.reply({ error: 'Model folder not found: m' });
    await expect(starting).rejects.toThrow('Model folder not found: m');
    await expect(starting).rejects.toBeInstanceOf(FatalVoiceError);
  });

  it('explains how to fix a Python that cannot be started', async () => {
    const program = fakeProgram(() => undefined);
    const starting = piperSource({ modelDir: 'm', python: 'nope', start: () => program.child });
    program.fail(new Error('spawn nope ENOENT'));
    await expect(starting).rejects.toThrow(/Could not start nope.*pip install "sherpa-onnx<2"/);
  });

  it('turns a crash into a fatal error for the phrase in progress, with what the program printed', async () => {
    const program = fakeProgram(() => undefined); // never answers
    const starting = piperSource({ modelDir: 'm', start: () => program.child });
    program.reply({ ready: true, name: 'm' });
    const source = await starting;
    const pending = source.speak('x');
    program.stderr.write('Segmentation fault\n');
    await new Promise((r) => setTimeout(r, 5));
    program.exit(139);
    await expect(pending).rejects.toThrow(/stopped \(exit 139\).*Segmentation fault/);
    await expect(source.speak('y')).rejects.toBeInstanceOf(FatalVoiceError);
  });

  it('shuts the program down when closed', async () => {
    const program = fakeProgram(() => undefined);
    const starting = piperSource({ modelDir: 'm', start: () => program.child });
    program.reply({ ready: true, name: 'm' });
    (await starting).close();
    expect(program.killed()).toBe(true);
  });
});
