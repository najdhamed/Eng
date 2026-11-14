import { useState } from 'react';
import type { Locale, Mobility } from '../domain/types';
import { useSpeech } from '../hooks/useSpeech';
import { useI18n } from '../i18n/I18nContext';
import { usePrefs } from '../state/PrefsContext';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { Segmented } from './Segmented';
import { Switch } from './Switch';

/** Three questions on first visit. Every answer can be changed later in Settings. */
export function Onboarding() {
  const tr = useI18n();
  const { prefs, set } = usePrefs();
  const { speak } = useSpeech();
  const [step, setStep] = useState(0);

  const finish = () => {
    set({ onboarded: true });
    speak(tr.t('prefs.testPhrase'));
  };

  const questions = [
    <Segmented<Locale>
      key="lang"
      label={tr.t('onb.lang')}
      value={prefs.locale}
      onChange={(locale) => set({ locale })}
      variant="cards"
      options={[
        { value: 'ar', label: 'العربية', icon: 'globe' },
        { value: 'en', label: 'English', icon: 'globe' },
      ]}
    />,
    <Segmented<Mobility>
      key="mobility"
      label={tr.t('onb.mobility')}
      value={prefs.mobility}
      onChange={(mobility) => set({ mobility })}
      variant="cards"
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
    />,
    <div key="comfort" className="stack">
      <p className="segmented__label">{tr.t('onb.comfort')}</p>
      <Switch
        icon="speaker"
        label={tr.t('prefs.voice')}
        description={tr.t('prefs.voiceSub')}
        checked={prefs.voice}
        onChange={(voice) => set({ voice })}
      />
      <Switch
        icon="text"
        label={tr.t('onb.bigText')}
        checked={prefs.textSize !== 's'}
        onChange={(big) => set({ textSize: big ? 'l' : 's' })}
      />
      <Switch
        icon="contrast"
        label={tr.t('prefs.contrast')}
        description={tr.t('prefs.contrastSub')}
        checked={prefs.highContrast}
        onChange={(highContrast) => set({ highContrast })}
      />
    </div>,
  ];

  const last = step === questions.length - 1;
  return (
    <Dialog
      open
      title={tr.t('onb.title')}
      onClose={() => set({ onboarded: true })}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => set({ onboarded: true })}>
            {tr.t('onb.skip')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => (last ? finish() : setStep(step + 1))}
          >
            {last ? tr.t('onb.done') : tr.t('onb.next')}
            <Icon name={tr.dir === 'rtl' ? 'arrowLeft' : 'arrowRight'} size={20} />
          </button>
        </>
      }
    >
      <p className="sheet__lead">{tr.t('onb.sub')}</p>
      <p className="eyebrow" aria-live="polite">
        {tr.t('onb.progress', { n: step + 1 })}
      </p>
      <div className="onboarding__dots" aria-hidden="true">
        {questions.map((_, i) => (
          <span key={i} className={i <= step ? 'is-on' : undefined} />
        ))}
      </div>
      {questions[step]}
    </Dialog>
  );
}
