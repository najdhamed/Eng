import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { FatalVoiceError, type VoiceSource } from './voicePack';

/**
 * An open Arabic voice running on this machine: a Piper or Kokoro model driven
 * through sherpa-onnx by scripts/piper_voice.py. The model is started once and
 * asked for one phrase at a time, so nothing leaves the computer and no key is
 * needed.
 */

/** The part of a child process this needs, so it can be replaced in a test. */
export interface Child {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable | null;
  on(event: 'exit', listener: (code: number | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  kill(): unknown;
}

export interface PiperOptions {
  /** A folder from the sherpa-onnx "tts-models" release (tokens.txt, espeak-ng-data, the .onnx file…). */
  readonly modelDir: string;
  readonly python?: string;
  readonly script?: string;
  readonly start?: (command: string, args: string[]) => Child;
}

export interface PiperSource extends VoiceSource {
  close(): void;
}

const HERE = dirname(fileURLToPath(import.meta.url));

interface Pending {
  resolve: (wav: Uint8Array) => void;
  reject: (error: Error) => void;
}

export async function piperSource(options: PiperOptions): Promise<PiperSource> {
  const python = options.python ?? 'python3';
  const script = options.script ?? join(HERE, 'piper_voice.py');
  const start =
    options.start ??
    ((command, args) => spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] }) as Child);
  const child = start(python, [script, options.modelDir]);

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    // Kept only to explain a crash; the engine is chatty about its own set-up.
    stderr = `${stderr}${String(chunk)}`.slice(-2000);
  });

  const waiting: Pending[] = [];
  let isReady = false;
  let broken: Error | null = null;
  let onReady!: (name: string) => void;
  let onFail!: (error: Error) => void;
  const started = new Promise<string>((resolve, reject) => {
    onReady = resolve;
    onFail = reject;
  });
  const breakWith = (error: Error) => {
    broken ??= error;
    onFail(error); // no effect once the voice has started
    for (const pending of waiting.splice(0)) pending.reject(broken);
  };

  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message: { ready?: boolean; name?: string; wav?: string; error?: string };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      return; // not ours: a library printing to the wrong stream
    }
    if (message.ready) {
      isReady = true;
      onReady(message.name ?? basename(options.modelDir));
      return;
    }
    if (message.error && !isReady) {
      // The model could not be started: nothing will work, so stop the whole run.
      breakWith(new FatalVoiceError(message.error));
      return;
    }
    const pending = waiting.shift();
    if (!pending) return;
    if (message.wav) pending.resolve(new Uint8Array(Buffer.from(message.wav, 'base64')));
    else pending.reject(new Error(message.error ?? 'the voice answered with nothing'));
  });
  child.on('error', (error) =>
    breakWith(
      new FatalVoiceError(
        `Could not start ${python}: ${error.message}. Install Python 3 and run: pip install "sherpa-onnx<2" numpy`,
      ),
    ),
  );
  child.on('exit', (code) =>
    breakWith(
      new FatalVoiceError(
        `The voice program stopped (exit ${code ?? 'signal'}).${stderr ? ` ${stderr.trim().slice(-400)}` : ''}`,
      ),
    ),
  );

  const name = await started;

  // One phrase at a time: the model answers in the order it was asked.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    name: `sherpa:${name}`,
    speak(text) {
      const run = () =>
        new Promise<Uint8Array>((resolve, reject) => {
          if (broken) return reject(broken);
          waiting.push({ resolve, reject });
          child.stdin.write(`${JSON.stringify({ text })}\n`);
        });
      const next = chain.then(run, run);
      chain = next.catch(() => undefined);
      return next;
    },
    close() {
      lines.close();
      child.stdin.end();
      child.kill();
    },
  };
}
