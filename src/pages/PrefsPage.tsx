import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { APP_VERSION } from '../config';
import type { Locale, Mobility } from '../domain/types';
import { useSpeech } from '../hooks/useSpeech';
import { useI18n } from '../i18n/I18nContext';
import type { SpeechRate } from '../services/speech';
import { useJourney } from '../state/JourneyContext';
import { usePrefs, type TextSize, type Theme } from '../state/PrefsContext';
import { useToast } from '../state/ToastContext';

export function PrefsPage() {
  const tr = useI18n();
  const { prefs, set, reset } = usePrefs();
  const journey = useJourney();
  const toast = useToast();
  const speech = useSpeech();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="page">
      <header className="page-head">
        <h1 id="page-title" tabIndex={-1}>
          {tr.t('prefs.title')}
        </h1>
      </header>

      <section className="settings card" aria-labelledby="s-lang">
        <h2 id="s-lang" className="settings__title">
          <Icon name="globe" size={20} /> {tr.t('prefs.language')}
        </h2>
        <Segmented<Locale>
          label={tr.t('prefs.language')}
          hideLabel
          value={prefs.locale}
          onChange={(locale) => {
            speech.cancel();
            set({ locale });
          }}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
        />
      </section>

      <section className="settings card" aria-labelledby="s-mobility">
        <h2 id="s-mobility" className="settings__title">
          <Icon name="wheelchair" size={20} /> {tr.t('prefs.mobility')}
        </h2>
        <Segmented<Mobility>
          label={tr.t('prefs.mobility')}
          hideLabel
          variant="cards"
          value={prefs.mobility}
          onChange={(mobility) => set({ mobility })}
          options={[
            {
              value: 'walk',
              label: tr.t('mobility.walk'),
              sub: tr.t('mobility.walkSub'),
              icon: 'walk',
            },
            {
              value: 'wheelchair',
              label: tr.t('mobility.wheelchair'),
              sub: tr.t('mobility.wheelchairSub'),
              icon: 'wheelchair',
            },
            {
              value: 'stroller',
              label: tr.t('mobility.stroller'),
              sub: tr.t('mobility.strollerSub'),
              icon: 'stroller',
            },
          ]}
        />
      </section>

      <section className="settings card" aria-labelledby="s-voice">
        <h2 id="s-voice" className="settings__title">
          <Icon name="speaker" size={20} /> {tr.t('prefs.voice')}
        </h2>
        <Switch
          label={tr.t('prefs.voice')}
          description={tr.t('prefs.voiceSub')}
          checked={prefs.voice}
          onChange={(voice) => {
            if (!voice) speech.cancel();
            set({ voice });
          }}
        />
        <Segmented<SpeechRate>
          label={tr.t('prefs.rate')}
          value={prefs.rate}
          onChange={(rate) => set({ rate })}
          options={[
            { value: 'slow', label: tr.t('rate.slow') },
            { value: 'normal', label: tr.t('rate.normal') },
            { value: 'fast', label: tr.t('rate.fast') },
          ]}
        />
        <Switch
          label={tr.t('prefs.voicePack')}
          description={
            speech.packClips > 0
              ? `${tr.t('prefs.voicePackSub')} · ${tr.t('prefs.voicePackCount', { n: speech.packClips })}`
              : tr.t('prefs.voicePackNone')
          }
          checked={prefs.voicePack}
          onChange={(voicePack) => set({ voicePack })}
        />
        <div className="settings__row">
          <button
            type="button"
            className="btn btn--soft"
            disabled={!speech.supported}
            onClick={() => speech.speak(tr.t('prefs.testPhrase'), { force: true })}
          >
            <Icon name="speaker" />
            {tr.t('prefs.testVoice')}
          </button>
          <p className="settings__note">
            {!speech.supported
              ? tr.t('prefs.voiceUnsupported')
              : speech.voiceName
                ? tr.t('prefs.voiceName', { name: speech.voiceName })
                : null}
            {speech.supported && speech.fallbackVoice && (
              <span className="block">{tr.t('prefs.voiceMissing')}</span>
            )}
          </p>
        </div>
      </section>

      <section className="settings card" aria-labelledby="s-display">
        <h2 id="s-display" className="settings__title">
          <Icon name="text" size={20} /> {tr.t('prefs.display')}
        </h2>
        <Segmented<TextSize>
          label={tr.t('prefs.textSize')}
          value={prefs.textSize}
          onChange={(textSize) => set({ textSize })}
          options={[
            { value: 's', label: tr.t('size.s') },
            { value: 'm', label: tr.t('size.m') },
            { value: 'l', label: tr.t('size.l') },
          ]}
        />
        <Segmented<Theme>
          label={tr.t('prefs.theme')}
          value={prefs.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'system', label: tr.t('theme.system') },
            { value: 'light', label: tr.t('theme.light'), icon: 'sun' },
            { value: 'dark', label: tr.t('theme.dark'), icon: 'moon' },
          ]}
        />
        <Switch
          icon="contrast"
          label={tr.t('prefs.contrast')}
          description={tr.t('prefs.contrastSub')}
          checked={prefs.highContrast}
          onChange={(highContrast) => set({ highContrast })}
        />
      </section>

      <section className="settings card" aria-labelledby="s-staff">
        <h2 id="s-staff" className="settings__title">
          <Icon name="qr" size={20} /> {tr.t('prefs.staff')}
        </h2>
        <a className="settings__link" href="#signs">
          <span>
            <strong>{tr.t('prefs.signs')}</strong>
            <span className="settings__note">{tr.t('prefs.signsSub')}</span>
          </span>
          <Icon name={tr.dir === 'rtl' ? 'chevronLeft' : 'chevronRight'} />
        </a>
      </section>

      <section className="settings card" aria-labelledby="s-data">
        <h2 id="s-data" className="settings__title">
          <Icon name="info" size={20} /> {tr.t('prefs.data')}
        </h2>
        <p className="settings__note">{tr.t('prefs.dataSub')}</p>
        <div className="settings__row">
          <button
            type="button"
            className="btn btn--outline"
            disabled={journey.state.recents.length === 0}
            onClick={() => {
              journey.clearRecents();
              toast.show(tr.t('toast.cleared'));
            }}
          >
            <Icon name="history" />
            {tr.t('prefs.clearRecent')}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
            <Icon name="trash" />
            {tr.t('prefs.reset')}
          </button>
        </div>
      </section>

      <section className="about" aria-labelledby="s-about">
        <h2 id="s-about" className="settings__title">
          {tr.t('prefs.about')}
        </h2>
        <p>{tr.t('prefs.aboutText')}</p>
        <p className="settings__note">
          {tr.t('prefs.version', { version: APP_VERSION })} · {tr.t('app.demo')}
        </p>
      </section>

      <Dialog
        open={confirming}
        title={tr.t('prefs.reset')}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
              {tr.t('prefs.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                speech.cancel();
                reset();
                journey.reset();
                setConfirming(false);
                toast.show(tr.t('toast.reset'));
              }}
            >
              {tr.t('prefs.resetYes')}
            </button>
          </>
        }
      >
        <p>{tr.t('prefs.resetConfirm')}</p>
      </Dialog>
    </div>
  );
}
