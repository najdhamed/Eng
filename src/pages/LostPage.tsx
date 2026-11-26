import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FloorMap } from '../components/FloorMap';
import { Icon } from '../components/Icon';
import { MapViewport } from '../components/MapViewport';
import { PlacePicker } from '../components/PlacePicker';
import { placeCenter } from '../domain/geometry';
import { findPlace } from '../domain/hospital';
import type { Place } from '../domain/types';
import { useSpeech } from '../hooks/useSpeech';
import { useI18n } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import type { RouteName } from '../router/useHashRoute';
import { buzz } from '../services/device';
import {
  decodeQrFromFile,
  decodeQrFromVideo,
  parsePlaceCode,
  preloadQrDecoder,
} from '../services/qr';
import { useJourney } from '../state/JourneyContext';
import { useToast } from '../state/ToastContext';

type Phase =
  | { kind: 'choose' }
  | { kind: 'reading'; photo: string }
  | { kind: 'live' }
  | { kind: 'failed'; photo?: string; reason: MessageKey }
  | { kind: 'found'; place: Place }
  | { kind: 'pick' };

export function LostPage({ navigate }: { navigate: (route: RouteName) => void }) {
  const tr = useI18n();
  const journey = useJourney();
  const toast = useToast();
  const { speak } = useSpeech();
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const photoUrl = useRef<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const canLive = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    speak(tr.t('lost.prompt'));
    void preloadQrDecoder(); // ready before the first sign is scanned
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  useEffect(
    () => () => {
      stopCamera();
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    },
    [stopCamera],
  );

  const found = useCallback(
    (place: Place) => {
      stopCamera();
      buzz(60);
      setPhase({ kind: 'found', place });
      speak(
        tr.t('lost.foundSpeech', { place: tr.name(place.name), floor: tr.floorName(place.floor) }),
      );
    },
    [speak, stopCamera, tr],
  );

  const handleCode = useCallback(
    (text: string | null, photo?: string) => {
      if (!text) {
        setPhase({ kind: 'failed', reason: 'lost.notFound', ...(photo ? { photo } : {}) });
        speak(tr.t('lost.notFound'));
        return;
      }
      const place = findPlace(parsePlaceCode(text));
      if (place) found(place);
      else {
        setPhase({ kind: 'failed', reason: 'lost.unknownCode', ...(photo ? { photo } : {}) });
        speak(tr.t('lost.unknownCode'));
      }
    },
    [found, speak, tr],
  );

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    const url = URL.createObjectURL(file);
    photoUrl.current = url;
    setPhase({ kind: 'reading', photo: url });
    try {
      handleCode(await decodeQrFromFile(file), url);
    } catch {
      handleCode(null, url);
    }
  };

  // Live scanning: decode a frame roughly four times a second.
  useEffect(() => {
    if (phase.kind !== 'live') return;
    let cancelled = false;
    let timer = 0;
    const canvas = document.createElement('canvas');

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const element = video.current;
        if (!element) return;
        element.srcObject = media;
        void element.play().catch(() => undefined);
        const tick = () => {
          if (cancelled) return;
          const text = decodeQrFromVideo(element, canvas);
          if (text && findPlace(parsePlaceCode(text))) handleCode(text);
          else timer = window.setTimeout(tick, 250);
        };
        tick();
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: 'failed', reason: 'lost.cameraError' });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [phase.kind, handleCode, stopCamera]);

  const confirm = (place: Place) => {
    journey.setStart(place.id);
    toast.show(tr.t('toast.locationSet', { place: tr.name(place.name) }));
    navigate(journey.destination ? 'route' : 'places');
  };

  const photoInput = (label: string, primary: boolean) => (
    <label className={primary ? 'capture capture--primary' : 'btn btn--outline'}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={onPhoto}
      />
      {primary ? (
        <>
          <span className="capture__icon">
            <Icon name="qr" size={52} strokeWidth={1.8} />
          </span>
          <span className="capture__title">{label}</span>
          <span className="capture__sub">{tr.t('lost.photoSub')}</span>
        </>
      ) : (
        <>
          <Icon name="camera" />
          {label}
        </>
      )}
    </label>
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1 id="page-title" tabIndex={-1}>
          {tr.t('lost.title')}
        </h1>
        <p className="page-head__sub">{tr.t('lost.sub')}</p>
      </header>

      {phase.kind === 'choose' && (
        <div className="stack">
          {photoInput(tr.t('lost.photo'), true)}
          {canLive && (
            <button
              type="button"
              className="btn btn--outline btn--lg"
              onClick={() => setPhase({ kind: 'live' })}
            >
              <Icon name="camera" />
              {tr.t('lost.live')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--soft btn--lg"
            onClick={() => setPhase({ kind: 'pick' })}
          >
            <Icon name="sign" />
            {tr.t('lost.pick')}
          </button>
          <ul className="tips">
            <li>
              <Icon name="qr" size={20} /> {tr.t('lost.tip1')}
            </li>
            <li>
              <Icon name="sun" size={20} /> {tr.t('lost.tip2')}
            </li>
            <li>
              <Icon name="info" size={20} /> {tr.t('lost.tryDemo')}{' '}
              <a href="#signs">{tr.t('signs.title')}</a>
            </li>
          </ul>
        </div>
      )}

      {phase.kind === 'reading' && (
        <div className="scan card" aria-live="polite">
          <div className="scan__frame">
            <img src={phase.photo} alt={tr.t('lost.yourPhoto')} />
            <span className="scan__line" aria-hidden="true" />
          </div>
          <p className="scan__text">{tr.t('lost.reading')}</p>
        </div>
      )}

      {phase.kind === 'live' && (
        <div className="scan card">
          <div className="scan__frame scan__frame--live">
            <video ref={video} playsInline muted />
            <span className="scan__corners" aria-hidden="true" />
            <span className="scan__line" aria-hidden="true" />
          </div>
          <p className="scan__text">{tr.t('lost.liveHint')}</p>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => {
              stopCamera();
              setPhase({ kind: 'choose' });
            }}
          >
            <Icon name="close" />
            {tr.t('lost.stop')}
          </button>
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="stack">
          <div className="notice notice--warn" role="alert">
            <Icon name="alert" size={28} />
            <div>
              <p className="notice__title">{tr.t(phase.reason)}</p>
              <p>{tr.t('lost.notFoundSub')}</p>
            </div>
          </div>
          {phase.photo && (
            <img className="photo-thumb" src={phase.photo} alt={tr.t('lost.yourPhoto')} />
          )}
          {photoInput(tr.t('lost.retry'), false)}
          <PlacePicker
            initialFloor={journey.start.floor}
            onPick={found}
            title={tr.t('lost.pickTitle')}
          />
        </div>
      )}

      {phase.kind === 'pick' && (
        <PlacePicker
          initialFloor={journey.start.floor}
          onPick={found}
          title={tr.t('lost.pickTitle')}
        />
      )}

      {phase.kind === 'found' && (
        <div className="stack" aria-live="polite">
          <div className="notice notice--ok">
            <Icon name="locate" size={28} />
            <div>
              <p className="notice__title">
                {tr.t('lost.found', { place: tr.name(phase.place.name) })}
              </p>
              <p>{tr.floorName(phase.place.floor)}</p>
            </div>
          </div>
          <div className="mini-map card">
            <MapViewport
              label={tr.t('a11y.mapOf', { floor: tr.floorName(phase.place.floor) })}
              focus={{ ...placeCenter(phase.place), scale: 1.7, key: phase.place.id }}
            >
              <FloorMap
                floor={phase.place.floor}
                you={placeCenter(phase.place)}
                highlightId={phase.place.id}
              />
            </MapViewport>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => confirm(phase.place)}
          >
            <Icon name="route" />
            {journey.destination
              ? tr.t('lost.confirm', { toPlace: tr.toPlace(tr.name(journey.destination.name)) })
              : tr.t('lost.confirmNoDest')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setPhase({ kind: 'pick' })}
          >
            {tr.t('lost.notHere')}
          </button>
        </div>
      )}
    </div>
  );
}
