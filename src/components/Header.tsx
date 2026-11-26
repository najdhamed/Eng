import { useSpeech } from '../hooks/useSpeech';
import { useI18n } from '../i18n/I18nContext';
import type { RouteName } from '../router/useHashRoute';
import { usePrefs } from '../state/PrefsContext';
import { useToast } from '../state/ToastContext';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { NAV_ITEMS } from './navItems';

export function Header({ route }: { route: RouteName }) {
  const tr = useI18n();
  const { prefs, set } = usePrefs();
  const { cancel, speak } = useSpeech();
  const toast = useToast();

  const toggleVoice = () => {
    const voice = !prefs.voice;
    set({ voice });
    if (voice) {
      toast.show(tr.t('toast.voiceOn'));
      speak(tr.t('toast.voiceOn'), { force: true });
    } else {
      cancel();
      toast.show(tr.t('toast.voiceOff'));
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand" href="#home">
          <span className="brand__mark" aria-hidden="true">
            <BrandMark />
          </span>
          <span className="brand__text">
            <span className="brand__name">{tr.t('app.name')}</span>
            <span className="brand__tagline">{tr.t('app.tagline')}</span>
          </span>
        </a>

        <nav className="topnav" aria-label={tr.t('nav.main')}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.route}
              href={`#${item.route}`}
              className="topnav__link"
              aria-current={route === item.route ? 'page' : undefined}
            >
              <Icon name={item.icon} size={20} />
              {tr.t(item.label)}
            </a>
          ))}
        </nav>

        <div className="topbar__actions">
          <button
            type="button"
            className={prefs.voice ? 'icon-btn is-on' : 'icon-btn'}
            aria-pressed={prefs.voice}
            aria-label={prefs.voice ? tr.t('a11y.voiceOn') : tr.t('a11y.voiceOff')}
            onClick={toggleVoice}
          >
            <Icon name={prefs.voice ? 'speaker' : 'mute'} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--text"
            lang={prefs.locale === 'ar' ? 'en' : 'ar'}
            aria-label={tr.t('a11y.switchLang')}
            onClick={() => {
              cancel();
              set({ locale: prefs.locale === 'ar' ? 'en' : 'ar' });
            }}
          >
            {tr.t('lang.switch')}
          </button>
          <a
            className="icon-btn"
            href="#prefs"
            aria-label={tr.t('nav.prefs')}
            aria-current={route === 'prefs' ? 'page' : undefined}
          >
            <Icon name="sliders" />
          </a>
        </div>
      </div>
    </header>
  );
}
