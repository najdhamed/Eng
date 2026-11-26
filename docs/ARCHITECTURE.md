# Architecture

Darbak is a static single-page app: React 18 and TypeScript (strict), built with Vite. There is no backend. All routing, wording and search run in the browser, so the app keeps working when hospital Wi-Fi drops.

## Layers

| Layer      | Folder                        | Depends on                   | Purpose                                                                                    |
| ---------- | ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Domain     | `src/domain`                  | nothing                      | Floor plate geometry, the hospital's places, helpers such as `placeCenter` and `doorPoint` |
| Navigation | `src/navigation`              | domain                       | Graph, Dijkstra, route planning, step generation                                           |
| Language   | `src/i18n`, `src/search`      | domain, navigation types     | Messages, plural rules, step wording, search                                               |
| Services   | `src/services`                | browser APIs                 | Speech, QR decoding, storage, wake lock, location, motion sensor, live tracker             |
| State      | `src/state`                   | domain, navigation, services | Preferences and the current journey, persisted to `localStorage`                           |
| UI         | `src/components`, `src/pages` | everything above             | React components and pages                                                                 |

The first three layers are framework-free and covered by unit tests.

## Data model

```ts
interface Place {
  id: string;           // "2-dental" — also printed on the QR sign
  floor: 0 | 1 | 2 | 3 | 4;
  name: { ar: string; en: string };
  category: 'clinic' | 'diagnostic' | 'service' | 'facility' | 'ward' | 'emergency' | ...;
  icon: IconName;
  node: string;         // corridor point in front of the door
  rect?: Rect;          // room footprint on the map
  amenities?: ('restroom' | 'prayer' | 'water' | 'seating' | 'exit' | 'wheelchair')[];
  hours?: { ar: string; en: string };
  keywords?: string[];  // search synonyms and common misspellings
}
```

Map units are 1/10 m. The demo uses one floor plate for all five floors (`src/domain/floorPlate.ts`); a real hospital would give each floor its own nodes and edges.

## Routing

`buildGraph()` creates one node per corridor point per floor (`"2:junction"`) and joins them with walking edges whose length is their distance in metres. Lift nodes are joined across every pair of floors; stair nodes only across neighbouring floors.

Edge cost is metres for walking. Lifts cost `22 + 3 × floors` and stairs `15` per floor (`src/config.ts`). `edgeAllowed()` removes stair edges unless the visitor is walking.

`shortestPathTree()` is Dijkstra with a binary heap. `planRoute()` runs it from the start place's node and reconstructs the edge list to the destination. `travelFrom()` reuses one tree to measure every place at once (for the "x minutes away" labels), and `nearestPlace()` picks the quickest place matching a predicate (nearest restroom, prayer room, exit).

## From path to spoken steps

`buildSteps()` walks the edge list:

- The starting heading is "north" at the main entrance, "west" when leaving a lift, "east" when leaving the stairs, and "out of the room" otherwise.
- Consecutive walking edges with the same direction merge into one step.
- `classifyTurn(heading, next)` uses the dot product for straight or back, and the sign of the cross product for right or left.
- Walks shorter than 8 m are folded into the next step; a short turn into the lift lobby becomes the lift step's `approach` ("the lifts are on your right").
- The final walk gets `arrivalSide`, from the cross product of the heading and the vector to the room's centre.

`describeRoute()` then renders each step through the message catalogue. Templates keep the verb first, round distances to 5 m and use `Intl.PluralRules('ar')` so counted nouns agree (`دقيقتين`، `3 دقايق`، `15 دقيقة`).

## Relocation with QR signs

Each sign carries either `darbak:<placeId>` or, on a deployed site, a link ending in `#here-<placeId>`, so a phone's own camera app opens Darbak at that spot. Inside the app, `decodeQrFromFile()` tries the browser's `BarcodeDetector` and falls back to `jsQR`. A recognised place becomes the new start, and the active route is re-planned from there. If no code is found the visitor picks the place from a pictogram grid instead; Darbak never guesses a location.

## Following a walk (live guidance)

Indoors, GPS drifts by tens of metres and the web has no barometer, so Darbak does not try to place a dot on the map from raw coordinates. It measures **how far the person has walked** and moves them along the route it already planned (`src/navigation/tracking.ts`, pure and exhaustively tested over every route).

- **Sources** (`src/services/live.ts`): footsteps from the accelerometer (`motion.ts`: gravity tracking, smoothing, peak detection, a walking-rhythm warm-up so shaking the phone does not count); GPS fixes (`location.ts`: only fixes better than 20 m, jitter ignored, impossible speeds dropped as jumps); and a demo walker. Steps win while they are counting; GPS is used when they are not; wheelchair mode uses GPS only (a chair has no footfalls).
- **Position** is the metres walked along the route. A step is announced about 4 m before its corner and the person is "arrived" within 2 m of the end.
- **Lifts and stairs** take zero metres in the graph and cannot be sensed, so the tracker waits (`awaitingFloor`) until the person taps "I am on floor X", presses Next, or scans a sign.
- **Permission** is requested only from a tap on "Allow and start", after a sheet that says what is used and why. Location and (on iPhone) motion are requested in the same tap. A refusal never blocks the app: the buttons keep working and the panel says what is missing. Nothing is stored or sent.

## Speech

`useSpeech` (`src/hooks/useSpeech.ts`) speaks every sentence through the browser's Web Speech API (`src/services/speech.ts`). The voice is picked by language preference: Saudi Arabic (`ar-SA`), then other Gulf voices, then any Arabic voice; English prefers `en-GB`. `isFallbackVoice` lets Settings say when the closest voice had to be used. Nothing is downloaded and nothing leaves the phone.

## Offline, install and security

- **Service worker** (`public/sw.js`): the build (`vite.config.ts`) writes the exact list of built files into its precache and a content hash into the cache name, so the **first** visit already works offline and a new deploy replaces the old cache. Pages are network-first and build files are cache-first. Covered by an offline test that goes offline right after the first load.
- **Install**: manifest with 192/512 and maskable PNG icons, apple-touch icon.
- **Content-Security-Policy** (meta tag, build only): scripts, styles, fonts and data from the site itself, no embeds or plug-ins. The e2e suite fails on any violation. The font is self-hosted, so no request leaves the device.
- **Resilient state**: saved settings and journeys are sanitised on load (`sanitizePrefs`, `sanitizeJourney`), storage that throws is tolerated, and an error boundary shows a bilingual "reload / start again" screen instead of a white page.
- **Bundle**: the staff page (QR sign generator) and the jsQR fallback decoder are loaded on demand; the first load is about 95 kB gzipped of JavaScript.

## Routing in the address bar

The router (`src/router/useHashRoute.ts`) uses plain `#name` fragments: `#home`, `#places`, `#map`, `#route`, `#lost`, `#prefs`, `#signs`. That works from any static host or sub-path and inside embeds. The active route itself lives in state, not in the URL.

## Adding a hospital

1. Describe each floor's corridor points and edges in `floorPlate.ts` (or split it per floor).
2. List the places in `hospital.ts` with their `node`, `rect`, names, icons and keywords.
3. Run `npm test`. The planner suite checks that every destination is reachable for every mobility type and that step-free routes never use stairs.
4. Print the QR signs from `#signs` and hang them under each department name.
