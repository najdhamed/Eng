import QRCode from 'qrcode';
import { expect, test } from '@playwright/test';
import { GROUND_ROUTE, seed, watchErrors } from './helpers';

test.describe('damaged or hand-edited saved data never leaves a blank screen', () => {
  const journeys = [
    'null',
    '"text"',
    '[1,2,3]',
    '{"startId":"nope","destinationId":"nada","stepIndex":0,"recents":["x",5,null]}',
    '{"startId":"0-entrance","destinationId":"0-cafeteria","stepIndex":-4}',
    '{"startId":"0-entrance","destinationId":"0-cafeteria","stepIndex":999}',
    '{"startId":"0-entrance","destinationId":"0-cafeteria","stepIndex":"abc","arrived":"yes","recents":"zzz"}',
    '{oops this is not json',
  ];
  const prefs = [
    'null',
    '[]',
    '{oops',
    '{"locale":5,"textSize":{},"rate":"x","voiceNames":{"ar":5}}',
    '{"voiceNames":null,"voicePack":"no","onboarded":"sure"}',
  ];

  for (const [index, journey] of journeys.entries()) {
    for (const route of ['home', 'route']) {
      test(`journey #${index + 1} (${journey.slice(0, 40)}) on #${route}`, async ({ page }) => {
        await page.addInitScript(
          ({ journey }) => {
            localStorage.setItem(
              'darbak:prefs',
              JSON.stringify({ locale: 'en', onboarded: true, voice: false }),
            );
            localStorage.setItem('darbak:journey', journey);
          },
          { journey },
        );
        const problems = watchErrors(page);
        await page.goto(`/#${route}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(problems.filter((p) => p.startsWith('pageerror'))).toEqual([]);
      });
    }
  }

  for (const [index, raw] of prefs.entries()) {
    test(`settings #${index + 1} (${raw.slice(0, 40)})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('darbak:prefs', value), raw);
      const problems = watchErrors(page);
      await page.goto('/#home');
      await expect(page.locator('h1, dialog[open]').first()).toBeVisible();
      expect(problems.filter((p) => p.startsWith('pageerror'))).toEqual([]);
    });
  }

  test('storage that throws (a private window) still lets the app run', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    const problems = watchErrors(page);
    await page.goto('/');
    await expect(page.locator('h1, dialog[open]').first()).toBeVisible();
    expect(problems.filter((p) => p.startsWith('pageerror'))).toEqual([]);
  });
});

test.describe('when something does break', () => {
  test('a crash shows a way out instead of a white screen, and starting again works', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en', journey: GROUND_ROUTE });
    await page.goto('/#home');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Make the next page fail while it draws itself.
    await page.evaluate(() => {
      Math.round = () => {
        throw new Error('boom');
      };
    });
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Places' })
      .click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('heading')).toHaveText('Something went wrong');

    await page.getByRole('button', { name: 'Clear saved data and start again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('darbak:journey'))).not.toContain(
      '0-cafeteria',
    );
  });
});

test.describe('scanning a sign', () => {
  test('a photographed QR sign tells the app where the person is', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    const problems = watchErrors(page);
    await page.goto('/#lost');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const sign = await QRCode.toBuffer('darbak:0-cafeteria', { width: 480, margin: 4 });
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'sign.png', mimeType: 'image/png', buffer: sign });

    await expect(page.getByText(/Found you! You are at/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/cafeteria/i).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('a photo with no sign in it says so kindly', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/#lost');
    const blank = await QRCode.toBuffer('hello', { width: 40, margin: 1 }); // a QR, but not ours
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: blank });
    await expect(page.getByText('This code is not a Darbak sign')).toBeVisible({ timeout: 15_000 });
  });
});
