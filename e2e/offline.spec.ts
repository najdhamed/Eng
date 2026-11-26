import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { GROUND_ROUTE, seed, watchErrors } from './helpers';

/** Waits until the service worker is in charge and has stored the whole app. */
async function waitForOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const names = (await caches.keys()).filter((name) => name.startsWith('darbak-'));
          const cache = names[0] ? await caches.open(names[0]) : null;
          return cache ? (await cache.keys()).length : 0;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(8); // page, script, styles, 4 font files, icons…
}

test.describe('offline', () => {
  test('the very first visit is already usable without a connection', async ({ page, context }) => {
    await seed(context, { locale: 'en', journey: GROUND_ROUTE });
    const problems = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await waitForOfflineReady(page);

    // The hospital Wi-Fi drops, and the person opens the app again.
    await context.setOffline(true);
    problems.length = 0; // the failed attempts below are expected
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/where are you going/i);

    // Everything still works: places, a route, the map.
    await page.goto('/#route');
    await expect(page.getByText(/Step 1 of \d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(page.getByText(/Step 2 of \d+/)).toBeVisible();

    // The self-hosted font came from the cache too.
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((font) => font.status === 'loaded').length;
    });
    expect(fonts).toBeGreaterThan(0);
    expect(problems.filter((problem) => problem.startsWith('pageerror'))).toEqual([]);
  });

  test('a language that was never opened still works offline', async ({ page, context }) => {
    await seed(context, { locale: 'ar' });
    await page.goto('/');
    await waitForOfflineReady(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a photographed sign is read on the phone with no connection at all', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/'); // the sign scanner is deliberately NOT opened while online
    await waitForOfflineReady(page);
    await context.setOffline(true);
    await page.reload();

    const requests: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
        requests.push(new URL(request.url()).origin);
      }
    });
    await page.goto('/#lost');
    const sign = await QRCode.toBuffer('darbak:0-cafeteria', { width: 480, margin: 4 });
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'sign.png', mimeType: 'image/png', buffer: sign });

    await expect(page.getByText(/Found you! You are at/)).toBeVisible({ timeout: 15_000 });
    // Nothing but the site itself was ever asked for: the photo never leaves the phone.
    expect(new Set(requests).size).toBeLessThanOrEqual(1);
  });

  test('the app can be installed: manifest and icons are valid and reachable', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const manifestUrl = new URL(href!, page.url()).toString();
    const manifest = await (await request.get(manifestUrl)).json();
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
      true,
    );
    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(new URL(icon.src, manifestUrl).toString());
      expect(response.ok(), icon.src).toBe(true);
    }
    const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
    expect((await request.get(new URL(apple!, page.url()).toString())).ok()).toBe(true);
  });
});
