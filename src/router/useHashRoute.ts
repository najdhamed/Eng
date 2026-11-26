import { useCallback, useEffect, useState } from 'react';

/**
 * A deliberately tiny hash router. Routes are plain `#name` fragments, so the
 * app works from any static host or sub-path, inside embeds, and offline.
 * `#here-<placeId>` is a deep link printed on QR signs: it sets the visitor's
 * location and then opens the home page.
 */
export const ROUTES = ['home', 'places', 'map', 'route', 'lost', 'prefs', 'signs'] as const;
export type RouteName = (typeof ROUTES)[number];

const isRoute = (value: string): value is RouteName =>
  (ROUTES as readonly string[]).includes(value);

export interface HashState {
  readonly route: RouteName;
  /** Place id from a `#here-<id>` link, consumed once by the app shell. */
  readonly herePlaceId: string | null;
}

function read(): HashState {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('here-')) return { route: 'home', herePlaceId: hash.slice(5) || null };
  return { route: isRoute(hash) ? hash : 'home', herePlaceId: null };
}

export function useHashRoute(): [HashState, (route: RouteName) => void] {
  const [state, setState] = useState<HashState>(read);

  useEffect(() => {
    const onChange = () => setState(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((route: RouteName) => {
    if (window.location.hash === `#${route}`) setState({ route, herePlaceId: null });
    else window.location.hash = route;
  }, []);

  return [state, navigate];
}
