import { useEffect, useMemo, useRef, useState } from 'react';
import { FloorMap } from '../components/FloorMap';
import { FloorSwitcher } from '../components/FloorSwitcher';
import { Icon } from '../components/Icon';
import { LiveConsent } from '../components/LiveConsent';
import { LivePanel } from '../components/LivePanel';
import { MapViewport } from '../components/MapViewport';
import { Pictogram, toneFor } from '../components/Pictogram';
import { doorPoint, placeCenter } from '../domain/geometry';
import type { Amenity, FloorId, Point } from '../domain/types';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { useSpeech } from '../hooks/useSpeech';
import { useWakeLock } from '../hooks/useWakeLock';
import { useI18n } from '../i18n/I18nContext';
import { describeRoute, routeIntro } from '../i18n/directionsText';
import type { MessageKey } from '../i18n/translate';
import type { IconName } from '../icons/paths';
import { routeOnFloor } from '../navigation/geometry';
import { nearestPlace, type PlannedRoute } from '../navigation/planner';
import type { Step } from '../navigation/directions';
import type { RouteName } from '../router/useHashRoute';
import { buzz } from '../services/device';
import { readJSON, writeJSON } from '../services/storage';
import { useJourney } from '../state/JourneyContext';

/** Where the "you are here" dot sits while a step is on screen. */
function positionFor(step: Step, route: PlannedRoute): Point {
  if (step.kind === 'start')
    return route.start.rect ? doorPoint(route.start) : placeCenter(route.start);
  return step.at;
}

const NEARBY: readonly { amenity: Amenity; label: MessageKey; icon: IconName }[] = [
  { amenity: 'restroom', label: 'home.nearest.restroom', icon: 'restroom' },
  { amenity: 'prayer', label: 'home.nearest.prayer', icon: 'prayer' },
  { amenity: 'seating', label: 'cat.facility', icon: 'seat' },
  { amenity: 'exit', label: 'home.nearest.exit', icon: 'exit' },
];

export function RoutePage({ navigate }: { navigate: (route: RouteName) => void }) {
  const tr = useI18n();
  const journey = useJourney();
  const { route } = journey;
  const { speak, cancel, speaking } = useSpeech();
  const [panel, setPanel] = useState<'map' | 'steps'>('map');
  const [consent, setConsent] = useState(false);
  const [follow, setFollow] = useState(true);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);

  // The sticky map sits right under the header, whose height changes with the
  // text size and the language. Measure it so the map never slides underneath.
  const hasRoute = Boolean(route);
  useEffect(() => {
    const header = head.current;
    const root = page.current;
    if (!header || !root || typeof ResizeObserver === 'undefined') return;
    const measure = () => root.style.setProperty('--route-head-h', `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [hasRoute]);
  const { tracker, live } = useLiveTracking(route);
  const liveOn = live?.status.active ?? false;

  const texts = useMemo(() => (route ? describeRoute(route, tr) : []), [route, tr]);
  const lastIndex = Math.max(0, (route?.steps.length ?? 1) - 1);
  // While live guidance runs, the walk decides the step; otherwise the person's taps do.
  const index = liveOn && live ? live.view.stepIndex : Math.min(journey.state.stepIndex, lastIndex);
  const arrived = journey.state.arrived || (liveOn && live?.view.phase === 'arrived');
  const step = route?.steps[index];
  const text = texts[index];

  const [floor, setFloor] = useState<FloorId>(step?.floor ?? 0);
  useEffect(() => {
    if (step) setFloor(step.floor);
  }, [index, route]); // eslint-disable-line react-hooks/exhaustive-deps

  useWakeLock(Boolean(route) && !arrived);

  // Keep the saved journey in step with the walk, and stop the sensors on arrival.
  useEffect(() => {
    if (!live?.status.active || !tracker) return;
    const { stepIndex, phase } = live.view;
    if (phase === 'arrived') {
      journey.setStep(stepIndex);
      journey.arrive();
      tracker.stop();
    } else if (stepIndex !== journey.state.stepIndex || journey.state.arrived) {
      journey.setStep(stepIndex);
    }
  }, [live, tracker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!route) navigate('places');
  }, [route, navigate]);

  // Speak each step as it comes up, and the route summary before the first one.
  const spokenFor = useRef<string>('');
  useEffect(() => {
    if (!route || !text) return;
    const key = `${route.destination.id}:${route.start.id}:${index}:${arrived}:${tr.locale}`;
    if (spokenFor.current === key) return;
    spokenFor.current = key;
    if (arrived)
      speak(
        `${tr.t('route.arrivedTitle', { place: tr.name(route.destination.name) })}. ${tr.t('route.arrivedSub')}`,
      );
    else speak(index === 0 ? `${routeIntro(route, tr)} ${text.speech}` : text.speech);
  }, [route, text, index, arrived, tr, speak]);

  const transfer = liveOn && live ? live.view.transfer : null;
  const transferFloor = transfer?.toFloor;
  useEffect(() => {
    if (transferFloor === undefined) return;
    speak(tr.t('live.floorSpeech', { floor: tr.floorName(transferFloor) }));
  }, [transferFloor, speak, tr]);

  useEffect(() => () => cancel(), [cancel]);

  const nearby = useMemo(
    () =>
      route
        ? NEARBY.map((item) => ({
            ...item,
            hit: nearestPlace(
              route.destination.id,
              route.mobility,
              (p) => p.amenities?.includes(item.amenity) ?? false,
            ),
          }))
        : [],
    [route],
  );

  if (!route || !step || !text) return null;

  const goTo = (next: number) => {
    buzz();
    if (liveOn && tracker) tracker.goToStep(next);
    else journey.setStep(next);
    requestAnimationFrame(() => stepTitle.current?.focus({ preventScroll: true }));
  };
  const onNext = () => {
    if (index < lastIndex) goTo(index + 1);
    else {
      buzz(60);
      if (liveOn && tracker) tracker.reanchor(route.nodes.length - 1);
      else journey.arrive();
    }
  };

  const beginLive = (demo: boolean) => {
    setConsent(false);
    setFollow(true);
    if (!demo) writeJSON('liveIntro', true);
    void tracker?.start({ demo }, index);
  };
  // Tapping "Follow my location" asks the browser for permission, so the very
  // first time it explains what is asked and why.
  const onStartLive = () => {
    if (readJSON('liveIntro', false)) beginLive(false);
    else setConsent(true);
  };

  const geometry = routeOnFloor(route, floor);
  const tracking = liveOn && live && !arrived;
  const you = arrived
    ? doorPoint(route.destination)
    : tracking
      ? live.view.point
      : positionFor(step, route);
  const youFloor: FloorId = arrived
    ? route.destination.floor
    : tracking
      ? live.view.floor
      : step.floor;
  const progressIndex = arrived
    ? route.nodes.length
    : tracking
      ? live.view.nodeIndex
      : step.pathIndex;
  const forward = tr.dir === 'rtl' ? 'arrowLeft' : 'arrowRight';
  const back = tr.dir === 'rtl' ? 'arrowRight' : 'arrowLeft';
  const metrics = route.metrics;

  return (
    <div ref={page} className={liveOn && !arrived ? 'route-page is-live' : 'route-page'}>
      <header ref={head} className="route-head">
        <button
          type="button"
          className="icon-btn icon-btn--ghost"
          aria-label={tr.t('a11y.back')}
          onClick={() => {
            cancel();
            navigate('places');
          }}
        >
          <Icon name={tr.dir === 'rtl' ? 'chevronRight' : 'chevronLeft'} />
        </button>
        <Pictogram icon={route.destination.icon} tone={toneFor(route.destination.category)} />
        <div className="route-head__text">
          <h1 id="page-title" tabIndex={-1} className="route-head__title">
            {tr.name(route.destination.name)}
          </h1>
          <p className="route-head__meta">
            <span>
              <Icon name="clock" size={15} /> {tr.duration(metrics.seconds)}
            </span>
            <span>{tr.distance(metrics.meters)}</span>
            <span>{tr.floorName(route.destination.floor)}</span>
            {route.stepFree && route.mobility !== 'walk' && (
              <span className="chip chip--ok">
                <Icon name="wheelchair" size={14} /> {tr.t('route.stepFree')}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            cancel();
            journey.end();
            navigate('home');
          }}
        >
          {tr.t('route.end')}
        </button>
      </header>

      {!arrived && (
        <div
          className="route-tabs"
          role="tablist"
          aria-label={tr.t('route.title', { place: tr.name(route.destination.name) })}
        >
          {(['map', 'steps'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={panel === key}
              aria-controls={`panel-${key}`}
              className="route-tabs__tab"
              onClick={() => setPanel(key)}
            >
              <Icon name={key === 'map' ? 'map' : 'route'} size={20} />
              {tr.t(key === 'map' ? 'route.map' : 'route.allSteps')}
            </button>
          ))}
        </div>
      )}

      <div className="route-body">
        <section
          id="panel-map"
          role="tabpanel"
          aria-labelledby="tab-map"
          className={panel === 'map' || arrived ? 'route-map is-active' : 'route-map'}
        >
          <FloorSwitcher
            value={floor}
            onChange={setFloor}
            youFloor={youFloor}
            destinationFloor={route.destination.floor}
            routeFloors={metrics.floors}
          />
          <MapViewport
            label={tr.t('a11y.mapOf', { floor: tr.floorName(floor) })}
            focus={{
              ...(floor === youFloor ? you : (geometry.destination ?? you)),
              scale: 1.6,
              // While following, the map moves with the person; a pan stops that until Recenter.
              key: tracking ? `${floor}:${youFloor}:${arrived}` : `${floor}:${index}:${arrived}`,
            }}
            follow={follow}
            onPan={() => setFollow(false)}
            onRecenter={() => {
              setFloor(youFloor);
              setFollow(true);
            }}
          >
            <FloorMap
              floor={floor}
              route={geometry}
              progressIndex={progressIndex}
              you={floor === youFloor ? you : null}
              followYou={Boolean(tracking)}
              destinationId={route.destination.id}
            />
          </MapViewport>

          {floor !== youFloor && (
            <button type="button" className="map-banner" onClick={() => setFloor(youFloor)}>
              {tr.t('route.viewFloor', { floor: tr.floorName(floor) })} ·{' '}
              <strong>{tr.t('route.backToStep')}</strong>
            </button>
          )}
          <ul className="map-legend" aria-hidden="true">
            <li>
              <span className="legend-dot" /> {tr.t('map.you')}
            </li>
            <li>
              <span className="legend-line" /> {tr.t('map.route')}
            </li>
            <li>
              <Icon name="pin" size={16} className="legend-pin" /> {tr.t('map.destination')}
            </li>
          </ul>
        </section>

        <aside className="route-side">
          {arrived ? (
            <section className="arrived" aria-live="polite">
              <span className="arrived__badge">
                <Icon name="check" size={48} strokeWidth={2.4} />
              </span>
              <h2 className="arrived__title" ref={stepTitle} tabIndex={-1}>
                {tr.t('route.arrivedTitle', { place: tr.name(route.destination.name) })}
              </h2>
              <p className="arrived__sub">{tr.t('route.arrivedSub')}</p>
              {route.destination.hours && (
                <p className="chip">
                  <Icon name="clock" size={14} /> {tr.name(route.destination.hours)}
                </p>
              )}
              <h3 className="section-title">{tr.t('route.nearbyHere')}</h3>
              <ul className="nearby">
                {nearby.map(({ amenity, label, icon, hit }) =>
                  hit ? (
                    <li key={amenity}>
                      <button
                        type="button"
                        className="nearby__item"
                        onClick={() => {
                          journey.continueFromHere();
                          journey.go(hit.place.id);
                        }}
                      >
                        <Pictogram
                          icon={icon}
                          size="sm"
                          tone={amenity === 'exit' ? 'ok' : 'soft'}
                        />
                        <span>
                          <span className="nearby__name">
                            {amenity === 'seating' ? tr.name(hit.place.name) : tr.t(label)}
                          </span>
                          <span className="nearby__meta">{tr.distance(hit.metrics.meters)}</span>
                        </span>
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
              <div className="arrived__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={() => {
                    journey.continueFromHere();
                    navigate('places');
                  }}
                >
                  <Icon name="pin" />
                  {tr.t('route.newDest')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    journey.continueFromHere();
                    navigate('home');
                  }}
                >
                  {tr.t('route.backHome')}
                </button>
              </div>
            </section>
          ) : (
            <>
              {live && (
                <LivePanel
                  live={live}
                  onStart={onStartLive}
                  onStop={() => tracker?.stop()}
                  onFloorDone={() => {
                    buzz();
                    tracker?.confirmFloor();
                  }}
                />
              )}
              <section className="step-sign" aria-live="polite" aria-atomic="true">
                <div className="step-sign__top">
                  <span className="step-sign__count">
                    {tr.t('route.stepOf', { n: index + 1, total: route.steps.length })}
                  </span>
                  {speaking && (
                    <span className="step-sign__speaking">
                      <span className="wave" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                      {tr.t('route.speaking')}
                    </span>
                  )}
                </div>
                <div className="step-sign__main">
                  <span className="step-sign__arrow">
                    <Icon name={text.icon} size={56} strokeWidth={2.2} />
                  </span>
                  <div className="step-sign__words">
                    <h2 className="step-sign__title" ref={stepTitle} tabIndex={-1}>
                      {text.title}
                    </h2>
                    {text.detail && <p className="step-sign__detail">{text.detail}</p>}
                  </div>
                </div>
                <div
                  className="step-sign__progress"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={route.steps.length}
                  aria-valuenow={index + 1}
                  aria-label={tr.t('route.stepOf', { n: index + 1, total: route.steps.length })}
                >
                  <span style={{ inlineSize: `${((index + 1) / route.steps.length) * 100}%` }} />
                </div>
              </section>
            </>
          )}
          {!arrived && (
            <div
              id="panel-steps"
              role="tabpanel"
              aria-labelledby="tab-steps"
              className={panel === 'steps' ? 'route-steps is-active' : 'route-steps'}
            >
              <ol className="steps">
                {texts.map((item, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={[
                        'steps__item',
                        i === index && 'is-current',
                        i < index && 'is-done',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-current={i === index ? 'step' : undefined}
                      onClick={() => goTo(i)}
                    >
                      <span className="steps__icon">
                        <Icon name={i < index ? 'check' : item.icon} size={20} strokeWidth={2} />
                      </span>
                      <span className="steps__text">
                        <span className="steps__title">{item.title}</span>
                        {i === index && item.detail && (
                          <span className="steps__detail">{item.detail}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>

              <a className="lost-link" href="#lost">
                <Icon name="camera" size={20} />
                {tr.t('lost.title')}
              </a>
            </div>
          )}
        </aside>
      </div>

      <LiveConsent
        open={consent}
        onAllow={() => beginLive(false)}
        onDemo={() => beginLive(true)}
        onClose={() => setConsent(false)}
      />

      {!arrived && (
        <div className="route-controls">
          <button
            type="button"
            className="btn btn--outline btn--square"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            aria-label={tr.t('route.prev')}
          >
            <Icon name={back} />
          </button>
          <button
            type="button"
            className="btn btn--soft btn--square"
            onClick={() => speak(text.speech, { force: true })}
            aria-label={tr.t('route.repeat')}
          >
            <Icon name="replay" />
          </button>
          <button type="button" className="btn btn--primary btn--lg btn--grow" onClick={onNext}>
            {index < lastIndex ? tr.t('route.next') : tr.t('route.arrive')}
            <Icon name={index < lastIndex ? forward : 'check'} />
          </button>
        </div>
      )}
    </div>
  );
}
