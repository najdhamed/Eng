import { expect, test } from '@playwright/test';
import { GROUND_ROUTE, seed, watchErrors } from './helpers';

test.describe('the app shell', () => {
  test('opens in English, left to right, with no errors and no outside requests', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en' });
    const problems = watchErrors(page);
    const outside: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost')) outside.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/where are you going/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    // Fonts, scripts and styles all come from the site itself (nothing leaves the device).
    expect(outside).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('opens in Arabic, right to left', async ({ page, context }) => {
    await seed(context, { locale: 'ar' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('self-hosted font is actually used', async ({ page, context }) => {
    await seed(context, { locale: 'ar' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const families = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(families.join(' ')).toContain('Readex Pro Variable');
  });

  test('the bottom navigation reaches every main page', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const [name, hash] of [
      ['Places', '#places'],
      ['Map', '#map'],
      ['Lost?', '#lost'],
      ['Home', '#home'],
    ] as const) {
      await nav.getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`${hash}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('settings opens from the header', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page).toHaveURL(/#prefs$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  });
});

test.describe('finding a place and getting a route', () => {
  test('search, pick a place, and read the steps', async ({ page, context }) => {
    await seed(context, {
      locale: 'en',
      journey: { ...GROUND_ROUTE, destinationId: '0-entrance' },
    });
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search for a place' }).fill('cafeteria');
    await page
      .getByRole('button', { name: /cafeteria/i })
      .first()
      .click();
    await expect(page).toHaveURL(/#route$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/cafeteria/i);
    await expect(page.getByText(/Step 1 of \d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(page.getByText(/Step 2 of \d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.getByText(/Step 1 of \d+/)).toBeVisible();
  });

  test('a QR sign link sets where you are', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/#here-0-cafeteria');
    await expect(page).toHaveURL(/#home$/);
    await expect(page.getByText(/cafeteria/i).first()).toBeVisible();
  });
});
