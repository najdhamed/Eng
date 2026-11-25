import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { buildCatalogue } from '../src/voice/catalogue';
import { GROUND_ROUTE, makeWav, seed, watchErrors } from './helpers';

// Routes are mocked below, which a service worker would sidestep.
test.use({ serviceWorkers: 'block' });

const clipCount = async (page: Page): Promise<{ done: number; total: number }> => {
  const label = await page.getByRole('progressbar').first().getAttribute('aria-label');
  const match = /(\d+) of (\d+) clips/.exec(label ?? '');
  return { done: Number(match?.[1]), total: Number(match?.[2]) };
};

test.describe('Voice Studio', () => {
  test('records with the microphone, saves the pack as a ZIP, and takes it back', async ({
    page,
    context,
  }, testInfo) => {
    await context.grantPermissions(['microphone']);
    await seed(context, { locale: 'en' });
    const problems = watchErrors(page);
    await page.goto('/#studio');
    await expect(page.getByText('Preparing the list of phrases…')).toBeHidden({ timeout: 30_000 });

    const { total } = await clipCount(page);
    expect(total).toBeGreaterThan(50);
    expect((await clipCount(page)).done).toBe(0);

    for (let clip = 1; clip <= 3; clip += 1) {
      await page.getByRole('button', { name: /^(Record|Record again)/ }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Listening' })).toBeVisible();
      await page.waitForTimeout(2200); // the fake microphone beeps once a second
      await page.getByRole('button', { name: /^Stop/ }).click();
      await expect(page.getByRole('status').filter({ hasText: /Saved!/ })).toBeVisible();
      await expect.poll(async () => (await clipCount(page)).done).toBe(clip);
    }

    // Save the pack: a real ZIP that holds a manifest and one WAV per clip.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save the pack (ZIP)' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe('darbak-voice-en.zip');
    const zipPath = testInfo.outputPath('pack.zip');
    await saved.saveAs(zipPath);
    const zip = await readFile(zipPath);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zip.includes(Buffer.from('manifest.json'))).toBe(true);
    expect(zip.includes(Buffer.from('RIFF'))).toBe(true);

    // Forget this device's recordings, then import the pack again.
    await page.getByRole('button', { name: 'Delete this device’s recordings' }).click();
    await page.getByRole('button', { name: 'Yes, delete them all' }).click();
    await expect.poll(async () => (await clipCount(page)).done).toBe(0);

    await page.locator('input[type=file]').setInputFiles(zipPath);
    await expect(page.getByText('Imported 3 clips')).toBeVisible();
    await expect.poll(async () => (await clipCount(page)).done).toBe(3);

    expect(problems).toEqual([]);
  });

  test('keeps the recordings after a reload', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await seed(context, { locale: 'en' });
    await page.goto('/#studio');
    await expect(page.getByText('Preparing the list of phrases…')).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Record/ }).click();
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /^Stop/ }).click();
    await expect(page.getByText(/Saved!/)).toBeVisible();

    await page.reload();
    await expect(page.getByText('Preparing the list of phrases…')).toBeHidden({ timeout: 30_000 });
    expect((await clipCount(page)).done).toBe(1);
  });

  test('says so when the microphone is refused', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await page.goto('/#studio');
    await expect(page.getByText('Preparing the list of phrases…')).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Record/ }).click();
    await expect(page.getByText(/could not use the microphone/)).toBeVisible();
  });
});

test.describe('the recorded voice pack on the site', () => {
  test('is played instead of the device voice when it can say the whole sentence', async ({
    page,
    context,
  }) => {
    const catalogue = buildCatalogue('en');
    const wav = makeWav(80);
    await page.route('**/voice/en/manifest.json', (route) =>
      route.fulfill({
        json: {
          version: 1,
          locale: 'en',
          clips: catalogue.atoms.map((atom) => ({
            key: atom.key,
            text: atom.text,
            file: `${atom.id}.wav`,
            ms: 80,
          })),
        },
      }),
    );
    await page.route('**/voice/en/*.wav', (route) =>
      route.fulfill({ body: wav, contentType: 'audio/wav' }),
    );
    await seed(context, { locale: 'en', voice: true, journey: GROUND_ROUTE });
    await page.addInitScript(() => {
      const spy = { clips: 0, synth: 0 };
      (window as unknown as { __spy: typeof spy }).__spy = spy;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        spy.clips += 1;
        return start.apply(this, args);
      };
      const speak = window.speechSynthesis?.speak.bind(window.speechSynthesis);
      if (speak) {
        window.speechSynthesis.speak = (utterance) => {
          spy.synth += 1;
          speak(utterance);
        };
      }
    });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'Repeat' }).click();

    const spied = () =>
      page.evaluate(() => (window as unknown as { __spy: { clips: number; synth: number } }).__spy);
    await expect.poll(async () => (await spied()).clips, { timeout: 10_000 }).toBeGreaterThan(0);
    expect((await spied()).synth).toBe(0);
  });

  test('without a pack, the device voice speaks', async ({ page, context }) => {
    await seed(context, { locale: 'en', voice: true, journey: GROUND_ROUTE });
    await page.addInitScript(() => {
      const spy = { synth: 0 };
      (window as unknown as { __spy: typeof spy }).__spy = spy;
      const speak = window.speechSynthesis?.speak.bind(window.speechSynthesis);
      if (speak) {
        window.speechSynthesis.speak = (utterance) => {
          spy.synth += 1;
          speak(utterance);
        };
      }
    });
    await page.goto('/#route');
    await page.getByRole('button', { name: 'Repeat' }).click();
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __spy: { synth: number } }).__spy.synth),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });
});
