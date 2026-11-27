import { expect, test } from '@playwright/test';
import { buildCatalogue } from '../src/voice/catalogue';
import { GROUND_ROUTE, makeWav, seed } from './helpers';

// Routes are mocked below, which a service worker would sidestep.
test.use({ serviceWorkers: 'block' });

test.describe('the studio voice pack on the site', () => {
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
    await expect.poll(async () => (await spied()).clips, { timeout: 10_000 }).toBeGreaterThan(1);
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

test.describe('the studio voice setting', () => {
  test('says how many clips came with the site, or that none did', async ({ page, context }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/#prefs');
    await expect(
      page.getByText('Not installed yet. Darbak uses the phone’s own voice.'),
    ).toBeVisible();

    const catalogue = buildCatalogue('en');
    await page.route('**/voice/en/manifest.json', (route) =>
      route.fulfill({
        json: {
          version: 1,
          locale: 'en',
          clips: catalogue.atoms.slice(0, 7).map((atom) => ({
            key: atom.key,
            text: atom.text,
            file: `${atom.id}.wav`,
            ms: 80,
          })),
        },
      }),
    );
    await page.route('**/voice/en/*.wav', (route) =>
      route.fulfill({ body: makeWav(80), contentType: 'audio/wav' }),
    );
    await page.reload();
    await expect(page.getByText(/7 clips/)).toBeVisible();
  });

  test('can be switched off, and then the device voice speaks even with a pack', async ({
    page,
    context,
  }) => {
    const catalogue = buildCatalogue('en');
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
      route.fulfill({ body: makeWav(80), contentType: 'audio/wav' }),
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
    await page.goto('/#prefs');
    await page.getByRole('switch', { name: /Saudi studio voice/ }).click();
    await page.goto('/#route');
    const spied = () =>
      page.evaluate(() => (window as unknown as { __spy: { clips: number; synth: number } }).__spy);
    // The first tap unlocks the browser's audio with one silent buffer; that is not a clip.
    const unlocked = (await spied()).clips;
    await page.getByRole('button', { name: 'Repeat' }).click();
    await expect.poll(async () => (await spied()).synth, { timeout: 10_000 }).toBeGreaterThan(0);
    expect((await spied()).clips).toBe(unlocked);
  });
});

test.describe('how Arabic is read by the phone\u2019s own voice', () => {
  /** Collects every sentence handed to the device voice. */
  const spyOnSpeech = () => {
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    const speak = window.speechSynthesis?.speak.bind(window.speechSynthesis);
    if (speak) {
      window.speechSynthesis.speak = (utterance) => {
        heard.push(utterance.text);
        speak(utterance);
      };
    }
  };
  const heard = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);

  test('has its vowel marks and its numbers written as words', async ({ page, context }) => {
    await seed(context, { locale: 'ar', voice: true, journey: GROUND_ROUTE });
    await page.addInitScript(spyOnSpeech);
    await page.goto('/#route');
    // The route opens with its summary and the first step in one breath.
    await expect
      .poll(async () => (await heard(page)).length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    const sentence = (await heard(page))[0]!;
    expect(sentence).toContain('يَلَّا نَمْشِي'); // «يلا نمشي»
    expect(sentence).toContain('خُشّ'); // «خُش» is the Saudi «enter», not a formal verb
    expect(sentence).not.toMatch(/[0-9]/);
    expect(sentence).toMatch(/خُطُوَات/); // the steps in «الطريق ٤ خطوات»
  });

  test('is read as written when the vowel marks are switched off in Settings', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'ar', voice: true, journey: GROUND_ROUTE });
    await page.addInitScript(spyOnSpeech);
    await page.goto('/#prefs');
    const marks = page.getByRole('switch', { name: 'نطق بالحركات' });
    await expect(marks).toBeChecked();
    await marks.click();
    await expect(marks).not.toBeChecked();

    await page.goto('/#route');
    await expect
      .poll(async () => (await heard(page)).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const sentence = (await heard(page))[0]!;
    expect(sentence).toContain('يلا نمشي');
    expect(sentence).not.toContain('يَلَّا');
  });

  test('has no such setting in English, where there is nothing to mark', async ({
    page,
    context,
  }) => {
    await seed(context, { locale: 'en' });
    await page.goto('/#prefs');
    await expect(page.getByRole('switch', { name: 'Say Arabic with vowel marks' })).toHaveCount(0);
  });
});
