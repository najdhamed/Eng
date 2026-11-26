export const APP_VERSION = '1.1.2';

/** Average indoor speeds in metres per second (conservative for patients). */
export const SPEED_MPS = { walk: 1.1, wheelchair: 0.8, stroller: 0.95 } as const;

export const LIFT_WAIT_SECONDS = 45;
export const LIFT_SECONDS_PER_FLOOR = 6;
export const STAIRS_SECONDS_PER_FLOOR = 20;

/**
 * Routing costs, in metre-equivalents, for leaving the floor. They make one
 * flight of stairs the natural choice for someone walking, and the lift the
 * choice for two floors or more.
 */
export const COST = { liftBase: 22, liftPerFloor: 3, stairsPerFloor: 15 } as const;

/** Straight walks shorter than this are folded into the step before them. */
export const MIN_STEP_METERS = 8;

/** Prefix printed into every QR sign: `darbak:<place id>`. */
export const QR_PREFIX = 'darbak:';

/** An average adult step, used to turn counted steps into metres walked. */
export const STRIDE_METERS = 0.7;

/** A GPS fix worse than this (metres, 68% radius) is ignored: it cannot tell a corridor from the next. */
export const GPS_MAX_ACCURACY_METERS = 20;
