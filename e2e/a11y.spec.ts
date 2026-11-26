import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GROUND_ROUTE, TWO_FLOOR_ROUTE, seed } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function violationsOn(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes
        .slice(0, 4)
        .map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.split('\n')[1] ?? ''}`)
        .join('\n'),
  );
}

const PAGES = ['home', 'places', 'map', 'route', 'lost', 'prefs', 'signs', 'studio'] as const;

for (const locale of ['en', 'ar'] as const) {
  test.describe(`accessibility (${locale})`, () => {
    for (const name of PAGES) {
      test(`${name} page has no WCAG A/AA violations`, async ({ page, context }) => {
        await seed(context, { locale, journey: GROUND_ROUTE });
        await page.goto(`/#${name}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (name === 'studio') {
          await expect(page.locator('.studio__loading')).toBeHidden({ timeout: 30_000 });
        }
        expect(await violationsOn(page)).toEqual([]);
      });
    }
  });
}

test.describe('accessibility: states', () => {
  test('the consent sheet for following the walk', async ({ page, context }) => {
    await seed(context, { locale: 'en', journey: GROUND_ROUTE });
    await page.goto('/#route');
    await page.getByRole('button', { name: /Follow my location/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await violationsOn(page)).toEqual([]);
  });

  test('a live walk, including the wait at the lift', async ({ page, context }) => {
    await seed(context, { locale: 'en', journey: TWO_FLOOR_ROUTE });
    await page.clock.install();
    await page.goto('/#route');
    await page.getByRole('button', { name: /Follow my location/ }).click();
    await page.getByRole('button', { name: 'Try a demo walk' }).click();
    const floorButton = page.getByRole('button', { name: /^I am on / });
    for (let second = 0; second < 120 && !(await floorButton.isVisible()); second += 1) {
      await page.clock.runFor(500);
    }
    await expect(floorButton).toBeVisible();
    expect(await violationsOn(page)).toEqual([]);
  });

  for (const theme of ['dark', 'high-contrast'] as const) {
    test(`the home and route pages in ${theme} mode`, async ({ page, context }) => {
      await seed(context, { locale: 'en', journey: GROUND_ROUTE });
      await page.addInitScript((mode) => {
        const prefs = JSON.parse(localStorage.getItem('darbak:prefs') ?? '{}');
        if (mode === 'dark') prefs.theme = 'dark';
        else prefs.highContrast = true;
        // The seed runs first; this overrides it for the same first load.
        localStorage.setItem('darbak:prefs', JSON.stringify(prefs));
      }, theme);
      for (const name of ['home', 'route'] as const) {
        await page.goto(`/#${name}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        // Prove the mode is really on, so a pass is not an accident.
        await expect(page.locator('html')).toHaveAttribute(
          theme === 'dark' ? 'data-theme' : 'data-contrast',
          theme === 'dark' ? 'dark' : 'high',
        );
        expect(await violationsOn(page), `${name} in ${theme}`).toEqual([]);
      }
    });
  }

  test('the whole interface is usable at 200% text size', async ({ page, context }) => {
    await seed(context, { locale: 'en', journey: GROUND_ROUTE });
    await page.goto('/#route');
    await page.addStyleTag({ content: 'html{font-size:200% !important}' });
    // No sideways scrolling: content reflows rather than overflowing.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
