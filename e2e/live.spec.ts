import { expect, test, type Page } from '@playwright/test';
import { GROUND_ROUTE, TWO_FLOOR_ROUTE, seed, watchErrors } from './helpers';

const METERS_PER_DEGREE = 111_195;
const HOME = { latitude: 24.7136, longitude: 46.6753 };

/** Counts calls to watchPosition so a test can prove nothing was asked for. */
async function countLocationRequests(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const counter = { watch: 0 };
    (window as unknown as { __geo: typeof counter }).__geo = counter;
    const original = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = (...args) => {
      counter.watch += 1;
      return original(...args);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __geo: { watch: number } }).__geo.watch);
}

const stepNumber = async (page: Page): Promise<number> => {
  const text = await page
    .getByText(/Step \d+ of \d+/)
    .first()
    .innerText();
  return Number(/Step (\d+) of/.exec(text)?.[1]);
};

const openConsent = async (page: Page) => {
  await page.getByRole('button', { name: /Follow my location/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Let Darbak follow your walk' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe('live location: permission', () => {
  test('explains first and asks nothing from the phone until the person agrees', async ({
    page,
    context,
  }) => {
    await seed(context, { journey: GROUND_ROUTE });
    const requests = await countLocationRequests(page);
    await page.goto('/#route');

    const dialog = await openConsent(page);
    await expect(dialog.getByText('Location', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Motion sensor')).toBeVisible();
    expect(await requests()).toBe(0);

    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toBeHidden();
    expect(await requests()).toBe(0);
    await expect(page.getByRole('region', { name: 'Following your walk' })).toHaveCount(0);
  });

  test('asks the phone for the location when the person taps Allow', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...HOME, accuracy: 5 });
    await seed(context, { journey: GROUND_ROUTE });
    const requests = await countLocationRequests(page);
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Allow and start' }).click();
    const panel = page.getByRole('region', { name: 'Following your walk' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Location ±5 m')).toBeVisible();
    expect(await requests()).toBe(1);
  });

  test('when location is blocked, says so and the buttons still work', async ({
    page,
    context,
  }) => {
    // No permission granted: the headless browser refuses the request.
    await seed(context, { journey: GROUND_ROUTE });
    const problems = watchErrors(page);
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Allow and start' }).click();
    await expect(page.getByText(/Location is blocked/)).toBeVisible();

    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    expect(await stepNumber(page)).toBe(2);
    expect(problems.filter((p) => !p.includes('Geolocation'))).toEqual([]);
  });
});

test.describe('live location: following the walk', () => {
  test('GPS fixes move the person along the route, step by step', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...HOME, accuracy: 5 });
    await seed(context, { journey: GROUND_ROUTE });
    await page.clock.install();
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Allow and start' }).click();
    const panel = page.getByRole('region', { name: 'Following your walk' });
    await expect(panel.getByText('Location ±5 m')).toBeVisible();
    expect(await stepNumber(page)).toBe(1);

    // Walk north at 1.8 m per second for 40 s: far enough to finish the first leg.
    for (let second = 1; second <= 40; second += 1) {
      await context.setGeolocation({
        latitude: HOME.latitude + (second * 1.8) / METERS_PER_DEGREE,
        longitude: HOME.longitude,
        accuracy: 5,
      });
      await page.waitForTimeout(40); // let the browser deliver the fix to the page
      await page.clock.runFor(1000);
    }
    await expect(panel.getByText('from location')).toBeVisible();
    expect(await stepNumber(page)).toBeGreaterThan(1);
  });

  test('footsteps from the motion sensor move the person, and count as steps', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...HOME, accuracy: 30 }); // too vague to use indoors
    await seed(context, { journey: GROUND_ROUTE });
    // Like an iPhone: motion is only delivered after the app asks and the person agrees.
    await page.addInitScript(() => {
      (
        DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
      ).requestPermission = async () => 'granted';
    });
    // A walking phone: gravity plus a ~1.9 Hz bounce, 50 samples a second. The
    // app only listens once the person has agreed, so early samples are ignored.
    await page.addInitScript(() => {
      const start = performance.now();
      window.setInterval(() => {
        const t = (performance.now() - start) / 1000;
        window.dispatchEvent(
          new DeviceMotionEvent('devicemotion', {
            accelerationIncludingGravity: {
              x: 0.3,
              y: 0.2,
              z: 9.81 + 3 * Math.sin(2 * Math.PI * 1.9 * t),
            },
          }),
        );
      }, 20);
    });
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Allow and start' }).click();
    const panel = page.getByRole('region', { name: 'Following your walk' });
    await expect(panel).toBeVisible();

    await expect(panel.getByText('from your steps')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText(/\d+ steps/)).toBeVisible();
    await expect.poll(() => stepNumber(page), { timeout: 30_000 }).toBeGreaterThan(1);
  });

  test('when the motion sensor is refused, location alone carries on and says so', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...HOME, accuracy: 5 });
    await seed(context, { journey: GROUND_ROUTE });
    await page.addInitScript(() => {
      (
        DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
      ).requestPermission = async () => 'denied';
    });
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Allow and start' }).click();
    const panel = page.getByRole('region', { name: 'Following your walk' });
    await expect(panel.getByText(/motion sensor is unavailable or blocked/)).toBeVisible();
    await expect(panel.getByText('Location ±5 m')).toBeVisible();
  });

  test('the demo walk follows a two-floor route to the end without leaving the chair', async ({
    page,
    context,
  }) => {
    await seed(context, { journey: TWO_FLOOR_ROUTE });
    const requests = await countLocationRequests(page);
    await page.clock.install();
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Try a demo walk' }).click();
    const panel = page.getByRole('region', { name: 'Following your walk' });
    await expect(panel.getByText('Demo walk, not your real position')).toBeVisible();

    const arrived = page.getByText(/You have arrived at/);
    for (let second = 0; second < 240 && !(await arrived.isVisible()); second += 1) {
      await page.clock.runFor(1000);
    }
    await expect(arrived).toBeVisible();
    expect(await requests()).toBe(0); // the demo never touches the real location
  });

  test('"I am on the new floor" is offered at the lift, and moves on when tapped', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...HOME, accuracy: 5 });
    await seed(context, { journey: TWO_FLOOR_ROUTE });
    await page.goto('/#route');

    await (await openConsent(page)).getByRole('button', { name: 'Allow and start' }).click();
    await expect(page.getByRole('region', { name: 'Following your walk' })).toBeVisible();

    // Jump to the lift or stairs step with Next, as someone without a sensor would.
    const floorButton = page.getByRole('button', { name: /^I am on / });
    for (let i = 0; i < 12 && !(await floorButton.isVisible()); i += 1) {
      await page.getByRole('button', { name: 'Next step', exact: true }).click();
    }
    await expect(floorButton).toBeVisible();
    const before = await stepNumber(page);

    // The app scrolls the button clear of the fixed Back / Next bar and the sticky map,
    // so a thumb can reach it without any scrolling of the person's own.
    const reachable = () =>
      floorButton.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit !== null && button.contains(hit);
      });
    await expect.poll(reachable, { timeout: 5_000 }).toBe(true);
    const box = (await floorButton.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(floorButton).toBeHidden();
    expect(await stepNumber(page)).toBe(before + 1);
  });
});
