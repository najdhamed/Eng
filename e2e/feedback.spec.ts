import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GROUND_ROUTE, seed, watchErrors } from './helpers';

const ARRIVED = { ...GROUND_ROUTE, arrived: true };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('darbak:feedback') ?? '[]') as unknown[]);

const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );

test.describe('route feedback', () => {
  test('is asked when the visitor taps "I\'m here" at the end of the walk', async ({
    page,
    context,
  }) => {
    const problems = watchErrors(page);
    await seed(context, { locale: 'en', journey: GROUND_ROUTE });
    await page.goto('/#route');
    const here = page.getByRole('button', { name: "I'm here" });
    for (let i = 0; i < 20 && !(await here.isVisible()); i += 1) {
      await page.getByRole('button', { name: 'Next step', exact: true }).click();
    }
    await here.click();
    await expect(page.getByRole('heading', { name: 'Was the route right?' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('"right" takes one tap, is kept, and is not asked again after a refresh', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en', journey: ARRIVED });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'Yes, it was right' }).click();

    const thanks = page.getByText('Thank you! We noted that the route was right.');
    await expect(thanks).toBeVisible();
    await expect(thanks).toBeFocused();
    const [entry] = (await stored(page)) as Record<string, unknown>[];
    expect(entry).toMatchObject({
      from: '0-entrance',
      to: '0-cafeteria',
      verdict: 'right',
      reasons: [],
      mobility: 'walk',
      locale: 'en',
    });

    await page.reload();
    await expect(thanks).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Was the route right?' })).toHaveCount(0);
    expect(await stored(page)).toHaveLength(1);
  });

  test('a mistaken tap can be taken back', async ({ page, context }) => {
    await seed(context, { locale: 'en', journey: ARRIVED });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'Yes, it was right' }).click();
    await page.getByRole('button', { name: 'Change my answer' }).click();
    await expect(page.getByRole('heading', { name: 'Was the route right?' })).toBeFocused();
    expect(await stored(page)).toEqual([]);
    await page.getByRole('button', { name: 'No, something was wrong' }).click();
    await page.locator('.feedback').getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yes, it was right' })).toBeVisible();
    expect(await stored(page)).toEqual([]);
  });

  test('"wrong" asks what, with reasons to tick and a note, and keeps them', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en', journey: ARRIVED });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'No, something was wrong' }).click();
    await expect(page.getByRole('heading', { name: 'What went wrong?' })).toBeFocused();

    const floor = page.getByRole('button', { name: 'The floor or the lift' });
    await floor.click();
    await expect(floor).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'The voice was unclear' }).click();
    await floor.click(); // ticked by mistake: untick
    await expect(floor).toHaveAttribute('aria-pressed', 'false');
    await page
      .getByLabel('Anything to add? (optional)')
      .fill('I turned right\nbut the door was left');
    await page.getByRole('button', { name: 'Save my feedback' }).click();

    await expect(page.getByText('Thank you, we noted your feedback.')).toBeFocused();
    const [entry] = (await stored(page)) as Record<string, unknown>[];
    expect(entry).toMatchObject({
      verdict: 'wrong',
      reasons: ['voice'],
      note: 'I turned right but the door was left',
    });
  });

  test('is in Arabic, right to left, and fits a narrow phone', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seed(context, { locale: 'ar', journey: ARRIVED, textSize: 'l' });
    await page.goto('/#route');
    await expect(page.getByRole('heading', { name: 'الطريق كان صح؟' })).toBeVisible();
    await page.getByRole('button', { name: 'لا، فيه غلط' }).click();
    await expect(page.getByRole('heading', { name: 'وش كان الغلط؟' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('route feedback in Settings', () => {
  test('counts the answers, hands them over as a CSV file, and deletes them', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en', journey: ARRIVED });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'No, something was wrong' }).click();
    await page.getByRole('button', { name: 'The floor or the lift' }).click();
    await page.getByLabel('Anything to add? (optional)').fill('lift button, was "2"');
    await page.getByRole('button', { name: 'Save my feedback' }).click();

    await page.goto('/#prefs');
    await expect(page.getByTestId('feedback-totals')).toHaveText(
      'Answers: 1 · right 0 · with a problem 1',
    );

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download (CSV)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('darbak-feedback.csv');
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile((await file.path())!, 'utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const [header, row] = text.split('\r\n');
    expect(header).toBe(
      'time,from_id,from,to_id,to,verdict,reasons,note,mobility,guided,language,version',
    );
    expect(row).toContain(
      ',0-entrance,Main entrance,0-cafeteria,Cafeteria,wrong,floor,"lift button, was ""2""",walk,no,en,',
    );

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('feedback-totals')).toHaveText('No feedback yet.');
    expect(await stored(page)).toEqual([]);
    await expect(page.getByRole('button', { name: 'Download (CSV)' })).toBeDisabled();
  });
});

test.describe('route feedback: accessibility', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`the question, the list of reasons and the thanks (${locale})`, async ({
      page,
      context,
    }) => {
      const t =
        locale === 'en'
          ? {
              wrong: 'No, something was wrong',
              right: 'Yes, it was right',
              what: 'What went wrong?',
            }
          : { wrong: 'لا، فيه غلط', right: 'إيه، كان صح', what: 'وش كان الغلط؟' };
      await seed(context, { locale, journey: ARRIVED });
      await page.goto('/#route');
      await expect(page.getByRole('button', { name: t.right })).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await page.getByRole('button', { name: t.wrong }).click();
      await expect(page.getByRole('heading', { name: t.what })).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await page.locator('.feedback__actions .btn--primary').click();
      await expect(page.locator('.feedback__thanks')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }

  test('with the dark theme and high contrast', async ({ page, context }) => {
    await seed(context, { locale: 'en', journey: ARRIVED });
    await page.addInitScript(() => {
      const prefs = JSON.parse(localStorage.getItem('darbak:prefs') ?? '{}') as object;
      localStorage.setItem(
        'darbak:prefs',
        JSON.stringify({ ...prefs, theme: 'dark', highContrast: true }),
      );
    });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'No, something was wrong' }).click();
    expect(await violations(page)).toEqual([]);
  });
});
