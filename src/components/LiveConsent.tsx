import { useI18n } from '../i18n/I18nContext';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

interface LiveConsentProps {
  readonly open: boolean;
  readonly onAllow: () => void;
  readonly onDemo: () => void;
  readonly onClose: () => void;
}

/**
 * Explains, before the browser's own prompts, what is asked for and why. The
 * "Allow" button is what triggers those prompts, so it must start tracking
 * directly from its click handler.
 */
export function LiveConsent({ open, onAllow, onDemo, onClose }: LiveConsentProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      title={t('live.consentTitle')}
      onClose={onClose}
      footer={
        <div className="live-consent__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={onAllow}>
            <Icon name="locate" />
            {t('live.allow')}
          </button>
          <button type="button" className="btn btn--soft" onClick={onDemo}>
            <Icon name="walk" />
            {t('live.demo')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('live.notNow')}
          </button>
        </div>
      }
    >
      <p className="live-consent__intro">{t('live.consentIntro')}</p>
      <ul className="live-consent__list">
        <li>
          <span className="live-consent__icon">
            <Icon name="locate" />
          </span>
          <span>
            <strong>{t('live.permLocation')}</strong>
            <span className="live-consent__why">{t('live.permLocationWhy')}</span>
          </span>
        </li>
        <li>
          <span className="live-consent__icon">
            <Icon name="walk" />
          </span>
          <span>
            <strong>{t('live.permMotion')}</strong>
            <span className="live-consent__why">{t('live.permMotionWhy')}</span>
          </span>
        </li>
      </ul>
      <p className="notice notice--ok live-consent__note">
        <Icon name="check" />
        <span>{t('live.privacy')}</span>
      </p>
      <p className="live-consent__honest">{t('live.honest')}</p>
    </Dialog>
  );
}
