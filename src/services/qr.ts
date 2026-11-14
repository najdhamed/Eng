import jsQR from 'jsqr';
import { QR_PREFIX } from '../config';

export const encodePlaceCode = (placeId: string): string => `${QR_PREFIX}${placeId}`;

/** Accepts `darbak:<id>` or a link ending in `#here-<id>`; returns the place id. */
export function parsePlaceCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const value = text.trim();
  if (value.toLowerCase().startsWith(QR_PREFIX)) return value.slice(QR_PREFIX.length) || null;
  const link = value.match(/#here-([\w-]+)$/);
  return link?.[1] ?? null;
}

const MAX_SIDE = 1400;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

function nativeDetector(): BarcodeDetectorLike | null {
  const Ctor = (
    globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }
  ).BarcodeDetector;
  try {
    return Ctor ? new Ctor({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

function decodeCanvas(canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded pixels stay available after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Reads a QR code from a photo. Uses the browser's BarcodeDetector where it
 * exists (fast, hardware-backed) and falls back to jsQR everywhere else.
 */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const image = await loadImage(file);
  const native = nativeDetector();
  if (native) {
    try {
      const [hit] = await native.detect(image);
      if (hit?.rawValue) return hit.rawValue;
    } catch {
      // Fall through to jsQR.
    }
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return decodeCanvas(canvas);
}

/** Reads one frame of a live camera preview. */
export function decodeQrFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string | null {
  if (video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0) return null;
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas
    .getContext('2d', { willReadFrequently: true })
    ?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return decodeCanvas(canvas);
}
