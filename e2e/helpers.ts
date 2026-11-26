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
  textSize?: 's' | 'm' | 'l';
  /** Skips the one-time "follow my location" explainer when false. */
  liveIntroSeen?: boolean;
  journey?: { startId: string; destinationId: string; stepIndex?: number };
}

/** Puts the app in a known state before it first loads (no onboarding, voice off). */
export async function seed(context: BrowserContext, options: Seed = {}): Promise<void> {
  const prefs = {
    locale: options.locale ?? 'en',
    onboarded: true,
    mobility: options.mobility ?? 'walk',
    voice: options.voice ?? false,
    textSize: options.textSize ?? 's',
  };
  const journey = options.journey && {
    startId: options.journey.startId,
    destinationId: options.journey.destinationId,
    stepIndex: options.journey.stepIndex ?? 0,
    arrived: false,
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
