import type { BrowserContext, Page } from '@playwright/test';

/** Fails a test on any uncaught error or console error from the app itself. */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  return problems;
}

export interface Seed {
  locale?: 'ar' | 'en';
  mobility?: 'walk' | 'wheelchair';
  voice?: boolean;
  /** Read Arabic with vowel marks (the app's default is on). */
  marks?: boolean;
  textSize?: 's' | 'm' | 'l';
  /** Skips the one-time "follow my location" explainer when false. */
  liveIntroSeen?: boolean;
  journey?: { startId: string; destinationId: string; stepIndex?: number; arrived?: boolean };
}

/** Puts the app in a known state before it first loads (no onboarding, voice off). */
export async function seed(context: BrowserContext, options: Seed = {}): Promise<void> {
  const prefs = {
    locale: options.locale ?? 'en',
    onboarded: true,
    mobility: options.mobility ?? 'walk',
    voice: options.voice ?? false,
    ...(options.marks === undefined ? {} : { marks: options.marks }),
    textSize: options.textSize ?? 's',
  };
  const journey = options.journey && {
    startId: options.journey.startId,
    destinationId: options.journey.destinationId,
    stepIndex: options.journey.stepIndex ?? 0,
    arrived: options.journey.arrived ?? false,
    recents: [],
  };
  await context.addInitScript(
    ({ prefs, journey }) => {
      // Only seed on the very first load so that reloads keep what the app saved.
      if (sessionStorage.getItem('e2e:seeded')) return;
      sessionStorage.setItem('e2e:seeded', '1');
      localStorage.setItem('darbak:prefs', JSON.stringify(prefs));
      if (journey) localStorage.setItem('darbak:journey', JSON.stringify(journey));
    },
    { prefs, journey },
  );
}

/** The route page for a known pair of places on different floors. */
export const TWO_FLOOR_ROUTE = { startId: '0-entrance', destinationId: '2-internal' };
/** A short route on the ground floor. */
export const GROUND_ROUTE = { startId: '0-entrance', destinationId: '0-cafeteria' };

/** A short mono 16-bit 16 kHz WAV holding a quiet tone: stands in for a recorded clip. */
export function makeWav(milliseconds: number): Buffer {
  const rate = 16_000;
  const samples = Math.round((rate * milliseconds) / 1000);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
