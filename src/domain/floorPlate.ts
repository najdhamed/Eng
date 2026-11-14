import type { Localized, Point, Rect } from './types';

/**
 * Every floor of the demo hospital shares one floor plate (map units, 10 units = 1 m):
 *
 *            NW1      NW2      NE
 *   exit ─────┴────────┴────────┴───── exit      ← north corridor, y = 260
 *              W1      │      E1
 *         W2 (stairs)  │  E2 (lifts)             ← main corridor, x = 300
 *              W3      │      E3
 *              W4      │      E4
 *                  entrance (ground only)
 */
export const MAP_SIZE = { width: 600, height: 900 } as const;
export const UNITS_PER_METER = 10;

export const BUILDING: Rect = { x: 20, y: 20, w: 560, h: 860 };
export const CORRIDORS = {
  north: { x: 30, y: 230, w: 540, h: 60 },
  main: { x: 270, y: 290, w: 60, h: 570 },
  mainGround: { x: 270, y: 290, w: 60, h: 590 },
} as const satisfies Record<string, Rect>;

export type SlotName = 'NW1' | 'NW2' | 'NE' | 'W1' | 'E1' | 'W2' | 'E2' | 'W3' | 'E3' | 'W4' | 'E4';

export const SLOTS: Readonly<Record<SlotName, { rect: Rect; node: string }>> = {
  NW1: { rect: { x: 30, y: 40, w: 170, h: 180 }, node: 'h115' },
  NW2: { rect: { x: 210, y: 40, w: 180, h: 180 }, node: 'junction' },
  NE: { rect: { x: 400, y: 40, w: 170, h: 180 }, node: 'h485' },
  W1: { rect: { x: 30, y: 300, w: 230, h: 140 }, node: 'v370' },
  E1: { rect: { x: 340, y: 300, w: 230, h: 140 }, node: 'v370' },
  W2: { rect: { x: 30, y: 450, w: 230, h: 150 }, node: 'stairs' },
  E2: { rect: { x: 340, y: 450, w: 230, h: 150 }, node: 'lift' },
  W3: { rect: { x: 30, y: 610, w: 230, h: 150 }, node: 'v685' },
  E3: { rect: { x: 340, y: 610, w: 230, h: 150 }, node: 'v685' },
  W4: { rect: { x: 30, y: 770, w: 230, h: 90 }, node: 'v815' },
  E4: { rect: { x: 340, y: 770, w: 230, h: 90 }, node: 'v815' },
};

/** Walkable points on each floor. `entrance` exists on the ground floor only. */
export const CORRIDOR_NODES: Readonly<Record<string, Point>> = {
  exitWest: { x: 36, y: 260 },
  h115: { x: 115, y: 260 },
  junction: { x: 300, y: 260 },
  h485: { x: 485, y: 260 },
  exitEast: { x: 564, y: 260 },
  v370: { x: 300, y: 370 },
  v525: { x: 300, y: 525 },
  v685: { x: 300, y: 685 },
  v815: { x: 300, y: 815 },
  lift: { x: 360, y: 525 },
  stairs: { x: 240, y: 525 },
  entrance: { x: 300, y: 872 },
};

export const CORRIDOR_EDGES: ReadonlyArray<readonly [string, string]> = [
  ['exitWest', 'h115'],
  ['h115', 'junction'],
  ['junction', 'h485'],
  ['h485', 'exitEast'],
  ['junction', 'v370'],
  ['v370', 'v525'],
  ['v525', 'v685'],
  ['v685', 'v815'],
  ['v525', 'lift'],
  ['v525', 'stairs'],
];

export const GROUND_ONLY_EDGES: ReadonlyArray<readonly [string, string]> = [['v815', 'entrance']];

/** Landmarks a spoken direction can refer to ("walk until you reach the lifts"). */
export const NODE_LABELS: Readonly<Partial<Record<string, Localized>>> = {
  junction: { ar: 'تقاطع الممرات', en: 'the corridor junction' },
  v525: { ar: 'المصاعد', en: 'the lifts' },
};
