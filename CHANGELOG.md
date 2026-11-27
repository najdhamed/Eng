# Changelog

## 1.3.0 — 2026-11-27

The voice now reads Arabic the way a Saudi says it, and every visitor can say whether the route was right.

**New**

- **Vowel marks (التشكيل) for the spoken Arabic.** The screen keeps its plain spelling, but the text handed to a voice carries a mark on every word (`لِفّ يَمِين`, `الدَّرَج عَلَى يَسَارَك`) in Saudi pronunciation, not the formal one: no case endings, and Saudi forms such as `خُشّ`, `قُدَّامَك`, `لِين`. Numbers are written out as words with the right gender (`سِتّ خُطُوَات`, `ثَلَاثَة أَمْتَار`), times as people say them (`سَبْعَة وَنُصّ`), and a lone letter by its name (جناح **ب**, the lift button **G**). A test fails and names any word the app can say that has no marks yet, and another proves the marks only add vowels (take them off and the sentence is back).
- A **Read with vowel marks** switch in Settings (Arabic, on by default), in case a phone's voice reads marks badly.
- **Route feedback.** When the visitor arrives, Darbak asks _«الطريق كان صح؟»_: one tap for yes; _no_ opens what went wrong (a step, the floor or lift, the door or sign, too long, the voice, other) and an optional note. A mistaken tap can be taken back. There is no server, so answers stay on the device with no name and no location; **Settings → Route feedback** shows the totals, copies them or downloads them as a CSV file (opens in Excel with Arabic intact, notes that look like formulas are neutralised) and deletes them.
- **Open Arabic voices, for making the clips without a key.** `npm run voice:generate -- --engine piper --model <folder>` reads the phrases with a Piper or Kokoro voice running on the developer's own computer (through sherpa-onnx). `npm run voice:tashkeel -- <word>` drafts the marks for a new word with the published libtashkeel model.

**Improved**

- The "nearest to you" cards on Home say how far each place is; the floor lists on Home show a clear floor number. The tagline is hidden under 480 px so the header never wraps.

**Measured**

- Reading 30 real sentences with the open `ar_JO-kareem` voice and transcribing the result back with Whisper, the character error rate was **24%** without marks and **6–8%** with them (the lexicon, or the libtashkeel model). That is a proxy, not listening: the transcriber leans towards formal spelling, and it rewards the formal forms the lexicon deliberately avoids.

**Not done**

- No recorded pack is shipped from an open voice: the one tried is Jordanian formal Arabic, not Saudi, and the licence of its recordings could not be confirmed. The site still plays the Azure Saudi pack when `public/voice/ar/` has one, and the phone's voice otherwise.
- How a given phone's built-in Arabic voice treats the marks has not been listened to on real devices.

**Under the hood**

- 277 unit tests and 95 Playwright tests (feedback, the new Settings switch, axe scans of every new state in Arabic, English, dark and high contrast).

## 1.2.0 — 2026-11-26

A Saudi studio voice, made by Azure AI Speech and shipped with the site.

**New**

- **Saudi studio voice.** `npm run voice:generate` (or the **Generate Saudi voice** GitHub workflow, which keeps the Azure key as a repository secret) reads the app's 169 phrases once with `ar-SA-HamedNeural` or `ar-SA-ZariyahNeural` and writes them to `public/voice/ar/`. The site plays them instead of the phone's voice whenever they can say a whole sentence, and falls back to the phone's voice (Saudi first) for anything else. The workflow starts with a 12-clip listening test.
- A **Saudi studio voice** switch in Settings, with the number of clips that came with the site.

**Changed**

- The clip player only plays what the site ships; recording in the browser (Voice Studio), the device-voice picker and ZIP import were not brought back.

**Under the hood**

- Azure calls retry when busy or disconnected, never print the key, and stop at once when the key is refused; clips already made are kept, so an interrupted run can be run again.
- 225 unit tests and 83 Playwright tests cover the generator (against a fake Azure), the player and the Settings switch.

## 1.1.2 — 2026-11-26

The Darbak brand identity (symbol, colours) is now what the app looks like.

**Changed**

- The D-Pin symbol replaces the old route glyph in the header, the favicon and the home-screen icons (192, 512, maskable, Apple).
- Colours follow the identity: Royal Blue `#2156A5` for buttons and the route, Deep Navy `#0B162B` for text and the top bar, Light Blue `#77A9FF` as the accent in dark mode. Text contrast stays above 4.5:1 everywhere that was checked.
- The browser bar and the install splash use the identity colours (`theme_color` Royal Blue, `background_color` Deep Navy).
- The logo files are in `docs/brand/` and at the top of the README.

## 1.1.1 — 2026-11-26

The recorded-voice tooling was taken out of 1.1.0 (Voice Studio, device-voice picker, ZIP installer); everything else stayed.

## 1.1.0 — 2026-11-26

Live guidance, a recordable Saudi voice, and a technical hardening pass.

**New**

- **Follow my location.** Asks permission from a tap (after a sheet that explains what is used), follows the walk by steps (accelerometer) and GPS, moves along the planned route, announces the next turn just before the corner, and waits at lifts and stairs for "I am on floor X". A demo walk shows it without leaving a chair. Wheelchair mode relies on location alone.
- **Recorded Saudi voice.** A Voice Studio records the app's 169 phrases, shows how many routes are fully covered, exports a ZIP; `npm run voice:install` ships it. Sentences are built from clips, with the device voice as a per-sentence fallback. Until a pack is shipped, Saudi device voices are ranked first and the visitor can pick one in Settings.
- Home-screen icons (192, 512, maskable, Apple) and install metadata.

**Fixed**

- The service worker only cached files after the second visit; the first visit now works offline.
- A saved journey of `null` (or a negative step) left a blank screen until site data was cleared; saved data is now sanitised, and a crash shows a way out.
- The "I am on the new floor" button could sit under the Back / Next bar; the sticky map could cover the floor tabs and, on small phones with large text, half the screen.
- The language button, the brand name and the Emergency card could overflow at 320 px with the largest text.
- Accessibility: invalid `aria-controls` on the search box, accessible names that did not contain the visible text (language button, map rooms), a scrolling dialog that the keyboard could not reach.
- The first sentence spoken as a page opened ignored the recorded voice because the pack had not loaded yet.

**Under the hood**

- Readex Pro is served from the site (no Google Fonts request); a Content-Security-Policy limits everything to the site itself.
- Staff pages and the jsQR decoder load on demand: first load went from 155 kB to 95 kB of gzipped JavaScript.
- 220 unit tests and 88 Playwright tests (location and motion permissions, GPS and step walks, demo walk, Voice Studio, voice pack, offline, damaged storage, QR scanning, 320 px layouts, axe scans); CI runs both.
- Dev tooling updated to patched versions; production dependencies have no known advisories.

## 1.0.0 — 2026-11-14

First release for MEDATHON 2026.

- Turn-by-turn routing over a five-floor hospital graph (Dijkstra), with lift and stair rules.
- Step-free routes for wheelchair and stroller users.
- Saudi-Arabic and English directions with Arabic plural rules, spoken through the Web Speech API.
- Interactive floor maps with pan, pinch-zoom, a moving "you are here" dot and route progress.
- "Lost?" relocation by scanning a QR sign (BarcodeDetector with jsQR fallback), live camera scanning, or picking the visible place.
- Printable QR signs for every department.
- Arabic-aware search with voice input.
- Nearest restroom, prayer room, water and exit; one-tap Emergency.
- Large text, high contrast, dark mode, first-visit onboarding.
- Offline support (service worker) and screen wake lock during a route.
