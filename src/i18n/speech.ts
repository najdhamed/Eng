import { FLOORS, type FloorId, type Place } from '../domain/types';
import { PLACES } from '../domain/hospital';
import { planRoute } from '../navigation/planner';
import { describeRoute, routeIntro } from './directionsText';
import type { MessageKey, Translator } from './translate';

/**
 * Every sentence the app can say aloud is built here (or in directionsText),
 * so the recorded voice pack can be planned from exactly the same code.
 */

export const arrivedSpeech = (tr: Translator, place: Place): string =>
  `${tr.t('route.arrivedTitle', { place: tr.name(place.name) })}. ${tr.t('route.arrivedSub')}`;

export const floorWaitSpeech = (tr: Translator, floor: FloorId): string =>
  tr.t('live.floorSpeech', { floor: tr.floorName(floor) });

export const foundSpeech = (tr: Translator, place: Place): string =>
  tr.t('lost.foundSpeech', { place: tr.name(place.name), floor: tr.floorName(place.floor) });

/** The first step is spoken after a short summary of the whole route. */
export const firstStepSpeech = (intro: string, speech: string): string => `${intro} ${speech}`;

/** Messages with no variables that the app speaks. */
export const FIXED_SPEECH: readonly MessageKey[] = [
  'prefs.testPhrase',
  'toast.voiceOn',
  'lost.prompt',
  'lost.notFound',
  'lost.unknownCode',
];

/** One thing the app can say, and which route (if any) needs it. */
export interface Speakable {
  readonly text: string;
  /** Index into the list of routes, or -1 for sentences outside any route. */
  readonly route: number;
}

export const MOBILITIES = ['walk', 'wheelchair', 'stroller'] as const;

/** Every sentence the app can speak in one language, route by route. */
export function* speakables(tr: Translator): Generator<Speakable> {
  let route = 0;
  for (const mobility of MOBILITIES) {
    for (const from of PLACES) {
      for (const to of PLACES) {
        if (from.id === to.id) continue;
        const planned = planRoute(from.id, to.id, mobility);
        if (!planned) continue;
        const texts = describeRoute(planned, tr);
        const intro = routeIntro(planned, tr);
        for (const [i, text] of texts.entries()) {
          yield {
            text: i === 0 ? firstStepSpeech(intro, text.speech) : text.speech,
            route,
          };
        }
        route += 1;
      }
    }
  }
  for (const place of PLACES) {
    yield { text: arrivedSpeech(tr, place), route: -1 };
    yield { text: foundSpeech(tr, place), route: -1 };
  }
  for (const floor of FLOORS) yield { text: floorWaitSpeech(tr, floor), route: -1 };
  for (const key of FIXED_SPEECH) yield { text: tr.t(key), route: -1 };
}
