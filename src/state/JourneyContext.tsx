import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { DEFAULT_START_ID, findPlace } from '../domain/hospital';
import type { FloorId, Place } from '../domain/types';
import { planRoute, type PlannedRoute } from '../navigation/planner';
import { readJSON, writeJSON } from '../services/storage';
import { usePrefs } from './PrefsContext';

/**
 * Where the visitor is, where they are going and how far along they are.
 * Persisted, so a refreshed tab or a re-opened phone picks up the same route.
 */
export interface JourneyState {
  readonly startId: string;
  readonly destinationId: string | null;
  readonly stepIndex: number;
  readonly arrived: boolean;
  readonly recents: readonly string[];
  /** The floor the Map page shows when opened. */
  readonly browseFloor: FloorId | null;
}

const INITIAL: JourneyState = {
  startId: DEFAULT_START_ID,
  destinationId: null,
  stepIndex: 0,
  arrived: false,
  recents: [],
  browseFloor: null,
};

const STORAGE_KEY = 'journey';
const MAX_RECENTS = 6;

type Action =
  | { type: 'setStart'; id: string }
  | { type: 'go'; id: string }
  | { type: 'step'; index: number }
  | { type: 'arrive' }
  | { type: 'continueFromHere' }
  | { type: 'end' }
  | { type: 'browse'; floor: FloorId | null }
  | { type: 'clearRecents' }
  | { type: 'reset' };

function reducer(state: JourneyState, action: Action): JourneyState {
  switch (action.type) {
    case 'setStart':
      return { ...state, startId: action.id, stepIndex: 0, arrived: false };
    case 'go':
      return {
        ...state,
        destinationId: action.id,
        stepIndex: 0,
        arrived: false,
        recents: [action.id, ...state.recents.filter((id) => id !== action.id)].slice(
          0,
          MAX_RECENTS,
        ),
      };
    case 'step':
      return { ...state, stepIndex: Math.max(0, action.index), arrived: false };
    case 'arrive':
      return { ...state, arrived: true };
    case 'continueFromHere':
      return {
        ...state,
        startId: state.destinationId ?? state.startId,
        destinationId: null,
        stepIndex: 0,
        arrived: false,
      };
    case 'end':
      return { ...state, destinationId: null, stepIndex: 0, arrived: false };
    case 'browse':
      return { ...state, browseFloor: action.floor };
    case 'clearRecents':
      return { ...state, recents: [] };
    case 'reset':
      return INITIAL;
  }
}

function restore(): JourneyState {
  const saved = readJSON<Partial<JourneyState>>(STORAGE_KEY, {});
  const known = (id: unknown): id is string => typeof id === 'string' && Boolean(findPlace(id));
  return {
    ...INITIAL,
    startId: known(saved.startId) ? saved.startId : INITIAL.startId,
    destinationId: known(saved.destinationId) ? saved.destinationId : null,
    stepIndex: typeof saved.stepIndex === 'number' ? saved.stepIndex : 0,
    arrived: saved.arrived === true,
    recents: Array.isArray(saved.recents) ? saved.recents.filter(known).slice(0, MAX_RECENTS) : [],
  };
}

interface JourneyValue {
  readonly state: JourneyState;
  readonly start: Place;
  readonly destination: Place | null;
  readonly route: PlannedRoute | null;
  setStart(id: string): void;
  go(id: string): void;
  setStep(index: number): void;
  arrive(): void;
  continueFromHere(): void;
  end(): void;
  browse(floor: FloorId | null): void;
  clearRecents(): void;
  reset(): void;
}

const JourneyContext = createContext<JourneyValue | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const [state, dispatch] = useReducer(reducer, undefined, restore);

  useEffect(() => writeJSON(STORAGE_KEY, { ...state, browseFloor: null }), [state]);

  const start = findPlace(state.startId) ?? findPlace(DEFAULT_START_ID)!;
  const destination = findPlace(state.destinationId) ?? null;
  const route = useMemo(
    () => (destination ? planRoute(start.id, destination.id, prefs.mobility) : null),
    [start.id, destination, prefs.mobility],
  );

  const actions = useMemo(
    () => ({
      setStart: (id: string) => dispatch({ type: 'setStart', id }),
      go: (id: string) => dispatch({ type: 'go', id }),
      setStep: (index: number) => dispatch({ type: 'step', index }),
      arrive: () => dispatch({ type: 'arrive' }),
      continueFromHere: () => dispatch({ type: 'continueFromHere' }),
      end: () => dispatch({ type: 'end' }),
      browse: (floor: FloorId | null) => dispatch({ type: 'browse', floor }),
      clearRecents: () => dispatch({ type: 'clearRecents' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );

  const value = useMemo(
    () => ({ state, start, destination, route, ...actions }),
    [state, start, destination, route, actions],
  );
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyValue {
  const value = useContext(JourneyContext);
  if (!value) throw new Error('useJourney must be used inside <JourneyProvider>');
  return value;
}
