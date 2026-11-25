import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { MAP_SIZE } from '../domain/floorPlate';
import type { Point } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

interface View {
  readonly s: number;
  readonly x: number;
  readonly y: number;
}

export interface MapFocus extends Point {
  readonly scale: number;
  /** Change this to re-centre even when the point is the same. */
  readonly key: string | number;
}

interface MapViewportProps {
  readonly label: string;
  readonly focus?: MapFocus;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onRecenter?: () => void;
  /**
   * While false, a moving `focus` point no longer pulls the map back (the
   * person has panned away). A new `focus.key` still re-centres.
   */
  readonly follow?: boolean;
  /** Called once when the person starts dragging the map. */
  readonly onPan?: () => void;
}

const { width: W, height: H } = MAP_SIZE;
const MIN_SCALE = 0.85;
const MAX_SCALE = 4;
const FIT: View = { s: 1, x: 0, y: 0 };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Lets the map overshoot the frame by at most 15%, so it can never be lost. */
function clampView(view: View): View {
  const limit = (offset: number, size: number) => {
    const min = size - size * view.s - size * 0.15;
    const max = size * 0.15;
    return Math.min(Math.max(offset, Math.min(min, max)), Math.max(min, max));
  };
  return { s: view.s, x: limit(view.x, W), y: limit(view.y, H) };
}

function centreOn(point: Point, s: number): View {
  return clampView({ s, x: W / 2 - point.x * s, y: H / 2 - point.y * s });
}

/** Pan with one finger or the mouse, pinch or scroll to zoom, plus buttons. */
export function MapViewport({
  label,
  focus,
  children,
  className,
  onRecenter,
  follow = true,
  onPan,
}: MapViewportProps) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(() => (focus ? centreOn(focus, focus.scale) : FIT));
  const [animate, setAnimate] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; start: Point; distance: number; centre: Point } | null>(
    null,
  );
  const moved = useRef(false);

  const focusKey = useRef(focus?.key);
  useEffect(() => {
    if (!focus) return;
    const keyChanged = focusKey.current !== focus.key;
    focusKey.current = focus.key;
    if (!keyChanged && !follow) return;
    setAnimate(true);
    setView(centreOn(focus, focus.scale));
  }, [focus?.key, focus?.x, focus?.y, focus?.scale]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Screen pixels → map units, accounting for preserveAspectRatio="xMidYMid meet". */
  const toMap = useCallback((clientX: number, clientY: number): Point => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    const k = Math.min(box.width / W, box.height / H);
    return {
      x: (clientX - box.left - (box.width - W * k) / 2) / k,
      y: (clientY - box.top - (box.height - H * k) / 2) / k,
    };
  }, []);

  const zoomAround = useCallback((anchor: Point, factor: number, base?: View) => {
    setView((current) => {
      const from = base ?? current;
      const s = clampScale(from.s * factor);
      const ratio = s / from.s;
      return clampView({
        s,
        x: anchor.x - (anchor.x - from.x) * ratio,
        y: anchor.y - (anchor.y - from.y) * ratio,
      });
    });
  }, []);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setAnimate(false);
      zoomAround(toMap(event.clientX, event.clientY), Math.exp(-event.deltaY * 0.0015));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [toMap, zoomAround]);

  const beginGesture = () => {
    const points = [...pointers.current.values()];
    const [a, b] = points;
    if (!a) {
      gesture.current = null;
      return;
    }
    const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    gesture.current = {
      view,
      start: centre,
      centre,
      distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
    };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.current.set(event.pointerId, toMap(event.clientX, event.clientY));
    moved.current = false;
    setAnimate(false);
    beginGesture();
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, toMap(event.clientX, event.clientY));
    const [a, b] = [...pointers.current.values()];
    if (!a) return;
    const g = gesture.current;
    const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    const dx = centre.x - g.start.x;
    const dy = centre.y - g.start.y;
    if (Math.hypot(dx, dy) > 6) {
      if (!moved.current) {
        event.currentTarget.setPointerCapture(event.pointerId);
        onPan?.();
      }
      moved.current = true;
    }
    if (b && g.distance > 0) {
      const s = clampScale(g.view.s * (Math.hypot(a.x - b.x, a.y - b.y) / g.distance));
      const ratio = s / g.view.s;
      setView(
        clampView({
          s,
          x: centre.x - (g.start.x - g.view.x) * ratio,
          y: centre.y - (g.start.y - g.view.y) * ratio,
        }),
      );
    } else if (moved.current) {
      setView(clampView({ s: g.view.s, x: g.view.x + dx, y: g.view.y + dy }));
    }
  };

  const onPointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    beginGesture();
  };

  const zoomButton = (factor: number) => {
    setAnimate(true);
    zoomAround({ x: W / 2, y: H / 2 }, factor);
  };

  return (
    <div className={className ? `map-viewport ${className}` : 'map-viewport'}>
      <svg
        ref={svg}
        className="map-viewport__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          if (moved.current) {
            event.stopPropagation();
            moved.current = false;
          }
        }}
      >
        <g
          className={animate ? 'map-viewport__layer is-animated' : 'map-viewport__layer'}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        >
          {children}
        </g>
      </svg>
      <div className="map-controls">
        <button
          type="button"
          className="map-controls__btn"
          onClick={() => zoomButton(1.35)}
          aria-label={t('a11y.zoomIn')}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="map-controls__btn"
          onClick={() => zoomButton(1 / 1.35)}
          aria-label={t('a11y.zoomOut')}
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          className="map-controls__btn"
          aria-label={t('a11y.recenter')}
          onClick={() => {
            setAnimate(true);
            if (focus) setView(centreOn(focus, focus.scale));
            else setView(FIT);
            onRecenter?.();
          }}
        >
          <Icon name="locate" />
        </button>
      </div>
    </div>
  );
}
