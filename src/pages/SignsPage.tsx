import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Pictogram, toneFor } from '../components/Pictogram';
import { Segmented } from '../components/Segmented';
import { PLACES } from '../domain/hospital';
import { FLOORS, type FloorId } from '../domain/types';
import { useI18n } from '../i18n/I18nContext';
import { isFramed } from '../services/device';
import { encodePlaceCode } from '../services/qr';

const SIGNABLE = PLACES.filter((place) => place.category !== 'exit');

/**
 * Printable sign sheet for hospital staff. On a real deployment each code is a
 * link (`…#here-<id>`), so a phone's own camera app opens Darbak at that spot;
 * inside an embed it falls back to the in-app `darbak:<id>` format.
 */
function codeFor(placeId: string): string {
  if (isFramed() || !/^https?:$/.test(window.location.protocol)) return encodePlaceCode(placeId);
  const base = window.location.href.split('#')[0];
  return `${base}#here-${placeId}`;
}

export function SignsPage() {
  const tr = useI18n();
  const [floor, setFloor] = useState<FloorId | 'all'>('all');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const places = useMemo(
    () => SIGNABLE.filter((place) => floor === 'all' || place.floor === floor),
    [floor],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      SIGNABLE.map(async (place) => {
        const url = await QRCode.toDataURL(codeFor(place.id), {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'M',
          color: { dark: '#0E2140', light: '#FFFFFF' },
        });
        return [place.id, url] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setCodes(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page page--wide">
      <header className="page-head no-print">
        <h1 id="page-title" tabIndex={-1}>
          {tr.t('signs.title')}
        </h1>
        <p className="page-head__sub">{tr.t('signs.sub')}</p>
      </header>

      <div className="signs-toolbar no-print">
        <Segmented<FloorId | 'all'>
          label={tr.t('a11y.floors')}
          hideLabel
          value={floor}
          onChange={setFloor}
          options={[
            { value: 'all', label: tr.t('signs.allFloors') },
            ...FLOORS.map((f) => ({ value: f, label: tr.floorShort(f) })),
          ]}
        />
        {!isFramed() && (
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            <Icon name="printer" />
            {tr.t('signs.print')}
          </button>
        )}
      </div>

      <ul className="signs">
        {places.map((place) => (
          <li key={place.id} className="sign">
            <div className="sign__band">
              <Pictogram icon={place.icon} tone={toneFor(place.category)} size="lg" />
              <div className="sign__names">
                <span className="sign__ar" lang="ar" dir="rtl">
                  {place.name.ar}
                </span>
                <span className="sign__en" lang="en" dir="ltr">
                  {place.name.en}
                </span>
              </div>
              <span className="sign__floor">{tr.floorShort(place.floor)}</span>
            </div>
            <div className="sign__qr">
              {codes[place.id] ? (
                <img
                  src={codes[place.id]}
                  alt={`QR ${place.name[tr.locale]}`}
                  width={160}
                  height={160}
                />
              ) : (
                <span className="sign__qr-placeholder" />
              )}
              <span className="sign__hint">{tr.t('signs.scanMe')}</span>
              <code className="sign__id">{place.id}</code>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
