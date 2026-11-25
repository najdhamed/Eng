import { GPS_MAX_ACCURACY_METERS } from '../config';

/**
 * The phone's location, used for one thing only: measuring how far someone has
 * walked. Nothing is sent anywhere and no position is stored.
 *
 * Indoors a GPS fix is often tens of metres out, so the odometer only counts
 * fixes that are accurate enough to tell one corridor from the next, and it
 * ignores the small jumps a standing person's fix makes all the time.
 */

export interface GpsFix {
  /** Milliseconds, any monotonic clock. */
  readonly t: number;
  readonly lat: number;
  readonly lng: number;
  /** 68% radius, in metres. */
  readonly accuracy: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: Pick<GpsFix, 'lat' | 'lng'>, b: Pick<GpsFix, 'lat' | 'lng'>): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nobody walks faster than this indoors; a faster "move" is the fix jumping. */
const MAX_SPEED_MPS = 3;

export class GpsOdometer {
  private last: GpsFix | null = null;
  private total = 0;

  constructor(private readonly maxAccuracy = GPS_MAX_ACCURACY_METERS) {}

  reset(): void {
    this.last = null;
    this.total = 0;
  }

  get meters(): number {
    return this.total;
  }

  /** Feeds a fix. Returns the metres it added to the walk (0 when it was ignored). */
  push(fix: GpsFix): number {
    if (![fix.lat, fix.lng, fix.accuracy, fix.t].every(Number.isFinite)) return 0;
    if (fix.accuracy > this.maxAccuracy) return 0;
    if (!this.last) {
      this.last = fix;
      return 0;
    }

    const dt = (fix.t - this.last.t) / 1000;
    if (dt <= 0) return 0;
    const moved = haversine(this.last, fix);
    // Two fixes whose circles overlap may be the same spot: wait for a clear move.
    const noise = Math.max(2, 0.6 * Math.max(this.last.accuracy, fix.accuracy));
    if (moved < noise) return 0;
    if (moved / dt > MAX_SPEED_MPS) {
      // A jump: take the new fix as the reference without counting the distance.
      this.last = fix;
      return 0;
    }
    this.last = fix;
    this.total += moved;
    return moved;
  }
}

export type LocationPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

export function locationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** Reads the permission without asking. Browsers without the Permissions API answer "prompt". */
export async function locationPermission(): Promise<LocationPermission> {
  if (!locationSupported()) return 'unsupported';
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return status ? status.state : 'prompt';
  } catch {
    return 'prompt';
  }
}

export type LocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

/**
 * Starts watching the position. This is what makes the browser ask the person
 * for permission, so call it from a tap. Returns a function that stops it.
 */
export function watchLocation(
  onFix: (fix: GpsFix) => void,
  onFail: (failure: LocationFailure) => void,
): () => void {
  if (!locationSupported()) {
    onFail('unsupported');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (position) =>
      onFix({
        t: performance.now(),
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
    (error) =>
      onFail(
        error.code === error.PERMISSION_DENIED
          ? 'denied'
          : error.code === error.TIMEOUT
            ? 'timeout'
            : 'unavailable',
      ),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
