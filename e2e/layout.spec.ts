import { expect, test } from '@playwright/test';
import { GROUND_ROUTE, TWO_FLOOR_ROUTE, seed } from './helpers';

// The smallest phones still in use, with the largest text setting: nothing may
// spill past the screen edge or hide behind another control.
test.use({ viewport: { width: 320, height: 640 } });

const PAGES = ['home', 'places', 'map', 'route', 'lost', 'prefs', 'signs'] as const;

for (const locale of ['en', 'ar'] as const) {
  for (const name of PAGES) {
    test(`${name} fits a 320 px screen at the largest text size (${locale})`, async ({
      page,
      context,
    }) => {
      await seed(context, { locale, textSize: 'l', journey: GROUND_ROUTE });
      await page.goto(`/#${name}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

test('the header buttons never overlap each other', async ({ page, context }) => {
  await seed(context, { locale: 'en', textSize: 'l' });
  await page.goto('/');
  const boxes = await page
    .locator('.topbar__actions > *')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON()));
  expect(boxes.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < boxes.length; i += 1) {
    const [a, b] = [boxes[i - 1], boxes[i]];
    expect(a.right <= b.left + 0.5 || b.right <= a.left + 0.5).toBe(true);
  }
});

test('the live panel and the floor button fit above the fixed controls on a small phone', async ({
  page,
  context,
}) => {
  await seed(context, { locale: 'en', textSize: 'l', journey: TWO_FLOOR_ROUTE });
  await page.clock.install();
  await page.goto('/#route');
  await page.getByRole('button', { name: /Follow my location/ }).click();
  await page.getByRole('button', { name: 'Try a demo walk' }).click();
  const floorButton = page.getByRole('button', { name: /^I am on / });
  for (let i = 0; i < 160 && !(await floorButton.isVisible()); i += 1) {
    await page.clock.runFor(500);
  }
  await expect(floorButton).toBeVisible();
  const reachable = () =>
    floorButton.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && button.contains(hit);
    });
  await expect.poll(reachable, { timeout: 5_000 }).toBe(true);
});
