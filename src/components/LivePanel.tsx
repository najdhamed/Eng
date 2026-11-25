import { useI18n } from '../i18n/I18nContext';
import type { LiveSnapshot } from '../services/live';
import { Icon } from './Icon';

interface LivePanelProps {
  readonly live: LiveSnapshot;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onFloorDone: () => void;
}

/** The live-guidance strip on the route page: start button, status, problems, floor change. */
export function LivePanel({ live, onStart, onStop, onFloorDone }: LivePanelProps) {
  const tr = useI18n();
  const { status, view } = live;

  if (!status.active) {
    return (
      <button type="button" className="live-start" onClick={onStart}>
        <span className="live-start__icon">
          <Icon name="locate" size={26} />
        </span>
        <span className="live-start__text">
          <strong>{tr.t('live.start')}</strong>
          <span>{tr.t('live.startSub')}</span>
        </span>
      </button>
    );
  }

  const demo = status.source === 'demo';
  const asking = status.location === 'asking' || status.motion === 'asking';
  const source =
    status.source === 'steps'
      ? tr.t('live.sourceSteps')
      : status.source === 'gps'
        ? tr.t('live.sourceGps')
        : status.source === 'demo'
          ? tr.t('live.sourceDemo')
          : null;
  const locationBlocked = status.location === 'denied';
  const motionBlocked = status.motion === 'denied';

  return (
    <section className="live-panel" aria-label={tr.t('live.on')}>
      <div className="live-panel__row">
        <span
          className={`live-pulse${status.walking || demo ? ' is-walking' : ''}`}
          aria-hidden="true"
        />
        <span className="live-panel__title" role="status">
          {demo ? tr.t('live.demoOn') : tr.t('live.on')}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onStop}>
          {tr.t('live.stop')}
        </button>
      </div>

      <ul className="live-panel__chips">
        {source && (
          <li className="chip chip--primary">
            <Icon name={status.source === 'gps' ? 'locate' : 'walk'} size={14} />
            {source}
          </li>
        )}
        {status.steps > 0 && !demo && (
          <li className="chip">{tr.t('live.stepsCount', { n: status.steps })}</li>
        )}
        {status.accuracy !== null && (
          <li className="chip">{tr.t('live.accuracy', { m: Math.round(status.accuracy) })}</li>
        )}
        {view.phase !== 'arrived' && (
          <li className="chip">
            {tr.t('live.remaining', { distance: tr.distance(view.remaining) })}
          </li>
        )}
      </ul>

      {asking && !demo && <p className="live-panel__hint">{tr.t('live.asking')}</p>}
      {locationBlocked && (
        <p className="live-panel__hint live-panel__hint--warn">{tr.t('live.locationDenied')}</p>
      )}
      {motionBlocked && !status.blind && (
        <p className="live-panel__hint">{tr.t('live.motionDenied')}</p>
      )}
      {status.blind && (
        <p className="live-panel__hint live-panel__hint--warn">{tr.t('live.blind')}</p>
      )}
      {!asking && !status.blind && !demo && !status.source && view.progress === 0 && (
        <p className="live-panel__hint">{tr.t('live.waiting')}</p>
      )}

      {view.transfer && (
        <div className="floor-wait">
          <p>
            {tr.t(view.transfer.kind === 'lift' ? 'live.floorLift' : 'live.floorStairs', {
              floor: tr.floorName(view.transfer.toFloor),
            })}
          </p>
          <button type="button" className="btn btn--primary btn--lg" onClick={onFloorDone}>
            <Icon name={view.transfer.kind === 'lift' ? 'lift' : 'stairs'} />
            {tr.t('live.floorDone', { floor: tr.floorName(view.transfer.toFloor) })}
          </button>
        </div>
      )}
    </section>
  );
}
