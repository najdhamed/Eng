# Changelog

## 1.1.1 — 2026-11-26

The recorded-voice tooling was taken out again; everything else from 1.1.0 stays.

**Removed**

- The Voice Studio page and its link in Settings, the recorded voice-pack engine, `npm run voice:install`, and the device-voice picker. Spoken directions use the phone's own voice again: Saudi Arabic (`ar-SA`) first, then other Gulf voices, then any Arabic voice. No voice files were ever published.

**Kept**

- Follow my location, the demo walk, offline-first service worker, security headers, icons, accessibility fixes and the dev-tooling updates.

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
